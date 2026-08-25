import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCache } from './cache.js';
import { attachFaresToRoutes } from './fares.js';
import { kmbFetch } from './kmb.js';
import { citybusAllStops, citybusRoutes } from './citybus.js';
import { startGtfsLoad } from './gtfs.js';
import { gmbHydrateServices, gmbRoutes } from './gmb.js';
import { nlbAllStops, nlbRoutes } from './nlb.js';
import { stopNameMissing } from './stopName.js';
import { bindAddStops } from '../00-required/addStops.js';

const DIR_TTL = 12 * 60 * 60 * 1000;
const CACHE_VERSION = 5;
const FILE = path.join(os.tmpdir(), 'transitbuddy-directory.json');

export const cache = createCache();

let directory = { routes: [], stops: [], stopMap: new Map() };
let loading = null;
let hydratingCtb = null;
let hydratingNlb = null;
let hydratingGmb = null;

function buildStopMap(stops) {
  const map = new Map();
  for (const stop of stops || []) {
    if (!stop?.stop) continue;
    map.set(stopKey(stop), stop);
    if (!map.has(stop.stop)) map.set(String(stop.stop), stop);
  }
  return map;
}

function revive(raw) {
  const stops = (raw.stops || []).map((stop) => ({ ...stop, co: stop.co || 'KMB' }));
  return {
    routes: raw.routes || [],
    stops,
    stopMap: buildStopMap(stops)
  };
}

export function stopKey(stop) {
  const co = String(stop?.co || 'KMB').toUpperCase();
  const id = stop?.stop || stop;
  return `${co}:${id}`;
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
  directory = {
    ...next,
    stopMap: buildStopMap(next.stops || [])
  };
  return directory;
}

function mergeStops(existing, extra) {
  const map = new Map((existing || []).map((stop) => [stopKey(stop), stop]));
  for (const stop of extra || []) {
    if (!stop?.stop) continue;
    const key = stopKey(stop);
    if (!map.has(key)) map.set(key, stop);
  }
  return [...map.values()];
}

function mergeRoutes(existing, extra, replaceCos = []) {
  const drop = new Set(replaceCos.map((c) => String(c).toUpperCase()));
  const kept = drop.size ? (existing || []).filter((row) => !drop.has(String(row.co || 'KMB').toUpperCase())) : (existing || []);
  const seen = new Set();
  const out = [];
  for (const row of [...kept, ...(extra || [])]) {
    const key = [
      String(row.co || 'KMB').toUpperCase(),
      row.route,
      row.bound,
      row.service_type,
      row.gmb_route_id || '',
      row.nlb_route_id || '',
      row.orig_en,
      row.dest_en
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function hydrateCitybusStops(routes, baseStops) {
  if (hydratingCtb) return hydratingCtb;
  hydratingCtb = (async () => {
    try {
      const ctbStops = await citybusAllStops(cache, routes);
      if (!ctbStops.length) return directory;
      setDirectory({
        routes: directory.routes.length ? directory.routes : routes,
        stops: mergeStops(baseStops || directory.stops.filter((s) => s.co !== 'CTB'), ctbStops)
      });
      await writeFileCache(directory);
      return directory;
    } finally {
      hydratingCtb = null;
    }
  })();
  return hydratingCtb;
}

async function hydrateNlb(routes) {
  if (hydratingNlb) return hydratingNlb;
  hydratingNlb = (async () => {
    try {
      const nlb = routes.filter((row) => row.co === 'NLB');
      const stops = await nlbAllStops(cache, nlb);
      if (!stops.length) return directory;
      setDirectory({
        routes: directory.routes,
        stops: mergeStops(directory.stops, stops)
      });
      await writeFileCache(directory);
      return directory;
    } finally {
      hydratingNlb = null;
    }
  })();
  return hydratingNlb;
}

async function hydrateGmb() {
  if (hydratingGmb) return hydratingGmb;
  hydratingGmb = (async () => {
    try {
      const services = await gmbHydrateServices(cache, { limit: 120 });
      if (services.length) {
        setDirectory({
          routes: mergeRoutes(directory.routes, services, ['GMB']),
          stops: directory.stops
        });
        await writeFileCache(directory);
      }
      return directory;
    } finally {
      hydratingGmb = null;
    }
  })();
  return hydratingGmb;
}

function startBackgroundHydrate() {
  if (!directory.stops.some((s) => s.co === 'NLB')) hydrateNlb(directory.routes).catch(() => {});
}

async function loadDirectory() {
  const fromDisk = await readFileCache();
  if (fromDisk) {
    setDirectory(fromDisk);
    startBackgroundHydrate();
    return directory;
  }
  const [routes, stops, ctb, nlb, gmb] = await Promise.all([
    kmbFetch('/route/', cache, DIR_TTL),
    kmbFetch('/stop', cache, DIR_TTL),
    citybusRoutes(cache),
    nlbRoutes(cache),
    gmbRoutes(cache)
  ]);
  const kmbRoutes = (routes || []).map((row) => ({ ...row, co: row.co || 'KMB' }));
  const kmbStops = (stops || []).map((row) => ({ ...row, co: row.co || 'KMB' }));
  setDirectory({
    routes: [...kmbRoutes, ...ctb, ...nlb, ...gmb],
    stops: kmbStops
  });
  await writeFileCache(directory);
  startBackgroundHydrate();
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
  return getDirectory();
}

export async function ensureNearbyStops() {
  return getDirectory();
}

export async function warmDirectory() {
  const dir = await getDirectory();
  await Promise.all([
    hydrateCitybusStops(dir.routes, dir.stops.filter((s) => s.co !== 'CTB')).catch(() => directory),
    hydrateNlb(dir.routes).catch(() => directory),
    hydrateGmb().catch(() => directory),
    startGtfsLoad()
  ]);
  return directory;
}

export function addStops(rows) {
  if (!directory.routes.length) return;
  let changed = false;
  for (const row of rows || []) {
    if (!row?.stop) continue;
    const key = stopKey(row);
    if (directory.stopMap.has(key)) continue;
    const stop = {
      stop: String(row.stop),
      name_tc: stopNameMissing(row) ? '' : (row.name_tc || row.name_en || ''),
      name_en: stopNameMissing(row) ? '' : (row.name_en || row.name_tc || ''),
      lat: row.lat,
      long: row.long,
      co: row.co || (String(row.stop).length === 6 ? 'CTB' : 'KMB')
    };
    directory.stops.push(stop);
    directory.stopMap.set(stopKey(stop), stop);
    if (!directory.stopMap.has(String(stop.stop))) directory.stopMap.set(String(stop.stop), stop);
    changed = true;
  }
  if (changed) writeFileCache(directory);
}

bindAddStops(addStops);
