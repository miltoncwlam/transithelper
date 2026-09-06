import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { pipeline } from 'node:stream/promises';

const GTFS_URL = 'https://static.data.gov.hk/td/pt-headway-en/gtfs.zip';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INDEX_VERSION = 2;
const DIR = path.join(os.tmpdir(), 'transitbuddy-gtfs');
const ZIP = path.join(DIR, 'gtfs.zip');
const INDEX = path.join(DIR, 'schedule.json');

let index = null;
let loading = null;

function norm(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/<BR>/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function parseHms(value) {
  const m = /^(\d+):(\d+):(\d+)$/.exec(String(value || '').trim());
  if (!m) return null;
  return ((Number(m[1]) * 60) + Number(m[2])) * 60 + Number(m[3]);
}

function splitCsv(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.replace(/\r$/, ''));
  return out;
}

async function unzipLinesOptional(zipPath, entry) {
  try {
    return await unzipLines(zipPath, entry);
  } catch {
    return [];
  }
}

function parseHeaderTable(lines, onRow) {
  if (!lines?.length) return;
  const header = splitCsv(lines[0]);
  const idx = Object.fromEntries(header.map((k, i) => [k, i]));
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    onRow(splitCsv(line), idx);
  }
}

function dayTypesOfService(cols, idx) {
  const types = new Set();
  const flag = (name) => String(cols[idx[name]] || '').trim() === '1';
  if (flag('monday') || flag('tuesday') || flag('wednesday') || flag('thursday') || flag('friday')) types.add('wd');
  if (flag('saturday')) types.add('sat');
  if (flag('sunday')) types.add('sun');
  return [...types];
}

function median(values) {
  if (!values?.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function routeKey(meta) {
  return [meta.agency, meta.route, meta.longName].join('|');
}

function pushWindow(buckets, key, day, startSec, endSec, headwaySec) {
  if (!day || startSec == null || endSec == null || !(headwaySec > 0)) return;
  if (!buckets.has(key)) buckets.set(key, new Map());
  const wkey = `${day}|${startSec}|${endSec}`;
  const list = buckets.get(key);
  if (!list.has(wkey)) list.set(wkey, []);
  list.get(wkey).push(headwaySec);
}

function flattenWindows(byKey) {
  const out = new Map();
  for (const [key, windows] of byKey) {
    const rows = [];
    for (const [wkey, headways] of windows) {
      const [days, start, end] = wkey.split('|');
      const headwaySec = median(headways);
      if (!headwaySec) continue;
      rows.push({
        days,
        startSec: Number(start),
        endSec: Number(end),
        headwaySec
      });
    }
    rows.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
    out.set(key, rows);
  }
  return out;
}

async function unzipLines(zipPath, entry) {
  const child = spawn('unzip', ['-p', zipPath, entry], { stdio: ['ignore', 'pipe', 'ignore'] });
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const lines = [];
  for await (const line of rl) lines.push(line);
  await new Promise((resolve, reject) => {
    child.on('close', (code) => (code === 0 || code === null ? resolve() : reject(new Error(`unzip ${entry} ${code}`))));
    child.on('error', reject);
  });
  return lines;
}

async function downloadZip() {
  await mkdir(DIR, { recursive: true });
  const res = await fetch(GTFS_URL, {
    headers: { 'User-Agent': 'TransitBuddy/1.0', Accept: 'application/zip' },
    signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) throw new Error(`GTFS HTTP ${res.status}`);
  await pipeline(res.body, createWriteStream(ZIP));
}

async function buildIndex() {
  await downloadZip();
  const routeLines = await unzipLines(ZIP, 'routes.txt');
  const routeHeader = splitCsv(routeLines[0]);
  const ri = Object.fromEntries(routeHeader.map((k, i) => [k, i]));
  const routes = new Map();
  for (const line of routeLines.slice(1)) {
    if (!line.trim()) continue;
    const cols = splitCsv(line);
    routes.set(cols[ri.route_id], {
      agency: cols[ri.agency_id],
      route: cols[ri.route_short_name],
      longName: cols[ri.route_long_name]
    });
  }

  const tripLines = await unzipLines(ZIP, 'trips.txt');
  const th = splitCsv(tripLines[0]);
  const ti = Object.fromEntries(th.map((k, i) => [k, i]));
  const tripMeta = new Map();
  for (const line of tripLines.slice(1)) {
    if (!line.trim()) continue;
    const cols = splitCsv(line);
    tripMeta.set(cols[ti.trip_id], {
      routeId: cols[ti.route_id],
      serviceId: cols[ti.service_id]
    });
  }

  const serviceDays = new Map();
  parseHeaderTable(await unzipLinesOptional(ZIP, 'calendar.txt'), (cols, idx) => {
    serviceDays.set(cols[idx.service_id], dayTypesOfService(cols, idx));
  });

  const windowBuckets = new Map();
  parseHeaderTable(await unzipLinesOptional(ZIP, 'frequencies.txt'), (cols, idx) => {
    const tripId = cols[idx.trip_id];
    const meta = tripMeta.get(tripId);
    const route = meta ? routes.get(meta.routeId) : null;
    if (!route) return;
    const startSec = parseHms(cols[idx.start_time]);
    const endSec = parseHms(cols[idx.end_time]);
    const headwaySec = Number(cols[idx.headway_secs]);
    const days = serviceDays.get(meta.serviceId) || [];
    const key = routeKey({ ...route, route: String(route.route).toUpperCase() });
    for (const day of days) pushWindow(windowBuckets, key, day, startSec, endSec, headwaySec);
  });
  const windowsByKey = flattenWindows(windowBuckets);

  const firstLast = new Map();
  const child = spawn('unzip', ['-p', ZIP, 'stop_times.txt'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  let header = null;
  let iTrip;
  let iArr;
  for await (const line of rl) {
    if (!header) {
      header = splitCsv(line);
      iTrip = header.indexOf('trip_id');
      iArr = header.indexOf('arrival_time');
      continue;
    }
    if (!line.trim()) continue;
    const cols = splitCsv(line);
    const sec = parseHms(cols[iArr]);
    if (sec == null) continue;
    const trip = cols[iTrip];
    const cur = firstLast.get(trip);
    if (!cur) firstLast.set(trip, { first: sec, last: sec });
    else {
      if (sec < cur.first) cur.first = sec;
      if (sec > cur.last) cur.last = sec;
    }
  }
  await new Promise((resolve) => child.on('close', resolve));

  const buckets = new Map();
  for (const [trip, span] of firstLast) {
    const dur = span.last - span.first;
    if (dur < 120 || dur > 4 * 60 * 60) continue;
    const meta = tripMeta.get(trip);
    const route = meta ? routes.get(meta.routeId) : null;
    if (!route) continue;
    const key = routeKey({ ...route, route: String(route.route).toUpperCase() });
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(dur);
  }

  const keys = new Set([...buckets.keys(), ...windowsByKey.keys()]);
  const rows = [];
  for (const key of keys) {
    const durs = buckets.get(key) || [];
    durs.sort((a, b) => a - b);
    const ms = durs.length ? durs[Math.floor(durs.length / 2)] * 1000 : null;
    const [agency, route, longName] = key.split('|');
    rows.push({
      agency,
      route: String(route || '').toUpperCase(),
      longName,
      ms,
      windows: windowsByKey.get(key) || []
    });
  }
  const payload = { version: INDEX_VERSION, savedAt: Date.now(), rows };
  await writeFile(INDEX, JSON.stringify(payload));
  return payload;
}

async function loadIndex() {
  try {
    const raw = JSON.parse(await readFile(INDEX, 'utf8'));
    if (raw?.version === INDEX_VERSION && raw?.rows?.length && Date.now() - raw.savedAt < TTL_MS) return raw;
  } catch {}
  return buildIndex();
}

export function startGtfsLoad() {
  if (!loading) {
    loading = loadIndex()
      .then((payload) => {
        index = payload;
        return payload;
      })
      .catch(() => {
        loading = null;
        return null;
      });
  }
  return loading;
}

export function setGtfsIndexForTests(payload) {
  index = payload;
  loading = payload ? Promise.resolve(payload) : null;
}

export function hktDayType(when) {
  const d = when instanceof Date ? when : parseHktWhen(when);
  if (!d) return 'wd';
  const dow = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Hong_Kong', weekday: 'short' }).format(d);
  if (dow === 'Sat') return 'sat';
  if (dow === 'Sun') return 'sun';
  return 'wd';
}

export function parseHktWhen(value, dateYmd, timeHm) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  const iso = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(iso)) {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const ymd = String(dateYmd || iso || '').slice(0, 10);
  const hm = String(timeHm || (/^\d{2}:\d{2}/.test(iso) ? iso : '08:00')).slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T${hm}:00+08:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function hktSecondsOfDay(when) {
  const d = when instanceof Date ? when : parseHktWhen(when);
  if (!d) return 8 * 3600;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);
  const num = (type) => Number(parts.find((row) => row.type === type)?.value || 0);
  return ((num('hour') * 60) + num('minute')) * 60 + num('second');
}

function matchGtfsRow(first) {
  if (!index?.rows?.length || !first?.route) return null;
  const route = String(first.route).toUpperCase();
  const co = String(first.co || 'KMB').toUpperCase();
  const orig = norm(first.orig_en || first.orig_tc);
  const dest = norm(first.dest_en || first.dest_tc);
  let best = null;
  let bestScore = 0;
  for (const row of index.rows) {
    if (row.route !== route) continue;
    const agencies = String(row.agency || '').toUpperCase().split('+');
    if (co && !agencies.includes(co)) continue;
    const longName = norm(row.longName);
    let score = 1;
    if (dest && longName.includes(dest)) score += 4;
    if (orig && longName.includes(orig)) score += 4;
    if (dest && longName.endsWith(dest)) score += 2;
    if (orig && longName.startsWith(orig)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

export function scheduledTripMs(first) {
  if (!index?.rows?.length) {
    startGtfsLoad();
    return null;
  }
  const row = matchGtfsRow(first);
  return row?.ms || null;
}

export function scheduledHeadwaySec(first, when) {
  if (!index?.rows?.length) {
    startGtfsLoad();
    return null;
  }
  const row = matchGtfsRow(first);
  const windows = row?.windows || [];
  if (!windows.length) return null;
  const day = hktDayType(when);
  const sec = hktSecondsOfDay(when);
  const hits = windows.filter((w) => w.days === day && sec >= w.startSec && sec < w.endSec);
  if (!hits.length) return null;
  hits.sort((a, b) => a.headwaySec - b.headwaySec);
  return hits[Math.floor(hits.length / 2)].headwaySec;
}

export function gtfsHasDayService(first, when) {
  if (!index?.rows?.length) {
    startGtfsLoad();
    return null;
  }
  const row = matchGtfsRow(first);
  if (!row) return null;
  const day = hktDayType(when);
  return (row.windows || []).some((w) => w.days === day);
}
