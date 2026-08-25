import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { pipeline } from 'node:stream/promises';

const GTFS_URL = 'https://static.data.gov.hk/td/pt-headway-en/gtfs.zip';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DIR = path.join(os.tmpdir(), 'transitbuddy-gtfs');
const ZIP = path.join(DIR, 'gtfs.zip');
const INDEX = path.join(DIR, 'durations.json');

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
  const tripRoute = new Map();
  for (const line of tripLines.slice(1)) {
    if (!line.trim()) continue;
    const cols = splitCsv(line);
    tripRoute.set(cols[ti.trip_id], cols[ti.route_id]);
  }

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
    const routeId = tripRoute.get(trip);
    const meta = routes.get(routeId);
    if (!meta) continue;
    const key = [meta.agency, meta.route, meta.longName].join('|');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(dur);
  }

  const rows = [];
  for (const [key, durs] of buckets) {
    durs.sort((a, b) => a - b);
    const ms = durs[Math.floor(durs.length / 2)] * 1000;
    const [agency, route, longName] = key.split('|');
    rows.push({ agency, route: String(route).toUpperCase(), longName, ms });
  }
  const payload = { savedAt: Date.now(), rows };
  await writeFile(INDEX, JSON.stringify(payload));
  return payload;
}

async function loadIndex() {
  try {
    const raw = JSON.parse(await readFile(INDEX, 'utf8'));
    if (raw?.rows?.length && Date.now() - raw.savedAt < TTL_MS) return raw;
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

export function scheduledTripMs(first) {
  if (!index?.rows?.length) {
    startGtfsLoad();
    return null;
  }
  if (!first?.route) return null;
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
      best = row.ms;
    }
  }
  return bestScore >= 5 ? best : null;
}
