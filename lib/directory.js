import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCache } from './cache.js';
import { kmbFetch } from './kmb.js';
import { citybusRoutes } from './citybus.js';

const DIR_TTL = 12 * 60 * 60 * 1000;
const FILE = path.join(os.tmpdir(), 'transitbuddy-directory.json');

export const cache = createCache();

let directory = { routes: [], stops: [], stopMap: new Map() };
let loading = null;

function revive(raw) {
  return {
    routes: raw.routes || [],
    stops: raw.stops || [],
    stopMap: new Map((raw.stops || []).map((stop) => [stop.stop, stop]))
  };
}

async function readFileCache() {
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf8'));
    if (Date.now() - raw.savedAt < DIR_TTL && raw.routes?.length) return revive(raw);
  } catch {}
  return null;
}

async function writeFileCache(dir) {
  try {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify({
      savedAt: Date.now(),
      routes: dir.routes,
      stops: dir.stops
    }));
  } catch {}
}

async function loadDirectory() {
  const fromDisk = await readFileCache();
  if (fromDisk) {
    directory = fromDisk;
    return directory;
  }
  const [routes, stops, ctb] = await Promise.all([
    kmbFetch('/route/', cache, DIR_TTL),
    kmbFetch('/stop', cache, DIR_TTL),
    citybusRoutes(cache)
  ]);
  const kmbRoutes = (routes || []).map((row) => ({ ...row, co: row.co || 'KMB' }));
  directory = {
    routes: [...kmbRoutes, ...ctb],
    stops,
    stopMap: new Map(stops.map((stop) => [stop.stop, stop]))
  };
  await writeFileCache(directory);
  return directory;
}

export async function getDirectory() {
  if (directory.routes.length && directory.stops.length) return directory;
  if (!loading) {
    loading = loadDirectory().catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}
