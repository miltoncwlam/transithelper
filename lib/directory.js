import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCache } from './cache.js';
import { attachFaresToRoutes } from './fares.js';
import { kmbFetch } from './kmb.js';
import { citybusAllStops, citybusRoutes } from './citybus.js';
import { startGtfsLoad } from './gtfs.js';

const DIR_TTL = 12 * 60 * 60 * 1000;
const CACHE_VERSION = 3;
const FILE = path.join(os.tmpdir(), 'transitbuddy-directory.json');

export const cache = createCache();

let directory = { routes: [], stops: [], stopMap: new Map() };
let loading = null;
let hydrating = null;

function revive(raw) {
  const stops = (raw.stops || []).map((stop) => ({ ...stop, co: stop.co || 'KMB' }));
  return {
    routes: raw.routes || [],
    stops,
    stopMap: new Map(stops.map((stop) => [stop.stop, stop]))
  };
}

async function readFileCache() {
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf8'));
    if (raw.version !== CACHE_VERSION) return null;
    if (Date.now() - raw.savedAt < DIR_TTL && raw.routes?.length) return revive(raw);
  } catch {}
  return null;
}

async function writeFileCache(dir) {
  try {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify({
      version: CACHE_VERSION,
      savedAt: Date.now(),
      routes: dir.routes,
      stops: dir.stops
    }));
  } catch {}
}

function setDirectory(next) {
  directory = next;
  return directory;
}

async function hydrateCitybusStops(routes, kmbStops) {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const ctbStops = await citybusAllStops(cache, routes);
      if (!ctbStops.length) return directory;
      const kmb = (kmbStops || directory.stops.filter((s) => s.co !== 'CTB'));
      const merged = [...kmb, ...ctbStops];
      setDirectory({
        routes: directory.routes.length ? directory.routes : routes,
        stops: merged,
        stopMap: new Map(merged.map((stop) => [stop.stop, stop]))
      });
      await writeFileCache(directory);
      return directory;
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}

async function loadDirectory() {
  const fromDisk = await readFileCache();
  if (fromDisk) {
    setDirectory(fromDisk);
    const hasCtb = fromDisk.stops.some((stop) => stop.co === 'CTB');
    if (!hasCtb) hydrateCitybusStops(fromDisk.routes, fromDisk.stops.filter((s) => s.co !== 'CTB')).catch(() => {});
    return directory;
  }
  const [routes, stops, ctb] = await Promise.all([
    kmbFetch('/route/', cache, DIR_TTL),
    kmbFetch('/stop', cache, DIR_TTL),
    citybusRoutes(cache)
  ]);
  const kmbRoutes = (routes || []).map((row) => ({ ...row, co: row.co || 'KMB' }));
  const kmbStops = (stops || []).map((row) => ({ ...row, co: row.co || 'KMB' }));
  setDirectory({
    routes: [...kmbRoutes, ...ctb],
    stops: kmbStops,
    stopMap: new Map(kmbStops.map((stop) => [stop.stop, stop]))
  });
  await writeFileCache(directory);
  hydrateCitybusStops(directory.routes, kmbStops).catch(() => {});
  return directory;
}

async function withFares(dir) {
  if (!dir?.routes?.length) return dir;
  return {
    ...dir,
    routes: await attachFaresToRoutes(dir.routes)
  };
}

export async function getDirectory() {
  startGtfsLoad();
  if (directory.routes.length && directory.stops.length) return withFares(directory);
  if (!loading) {
    loading = loadDirectory().catch((error) => {
      loading = null;
      throw error;
    });
  }
  return withFares(await loading);
}

export async function ensureCitybusStops() {
  const dir = await getDirectory();
  if (dir.stops.some((stop) => stop.co === 'CTB')) return dir;
  return hydrateCitybusStops(dir.routes, dir.stops.filter((s) => s.co !== 'CTB'));
}

export function addStops(rows) {
  if (!directory.routes.length) return;
  let changed = false;
  for (const row of rows || []) {
    if (!row?.stop || directory.stopMap.has(row.stop)) continue;
    const stop = {
      stop: row.stop,
      name_tc: row.name_tc || row.name_en || row.stop,
      name_en: row.name_en || row.name_tc || row.stop,
      lat: row.lat,
      long: row.long,
      co: row.co || (String(row.stop).length === 6 ? 'CTB' : 'KMB')
    };
    directory.stops.push(stop);
    directory.stopMap.set(stop.stop, stop);
    changed = true;
  }
  if (changed) writeFileCache(directory);
}
