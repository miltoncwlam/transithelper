import { lookupStopMap, stopNameMissing } from './stopName.js';

const BASE = 'https://rt.data.gov.hk/v2/transport/citybus';
const BATCH = 'https://rt.data.gov.hk/v1/transport/batch';
const STOP_TTL = 24 * 60 * 60 * 1000;
const ROUTE_STOP_TTL = 24 * 60 * 60 * 1000;
const ETA_TTL = 8 * 1000;

export function isCitybusStopId(id) {
  return /^\d{6}$/.test(String(id || ''));
}

export function stopCompany(stop) {
  if (stop?.co) return stop.co;
  return isCitybusStopId(stop?.stop || stop) ? 'CTB' : 'KMB';
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, worker));
  return out;
}

async function cityFetch(path, cache, ttlMs) {
  const key = `ctb:${path}`;
  const cached = cache.get(key);
  if (cached) return cached;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(BASE + path, {
        cache: 'no-store',
        headers: { Accept: 'application/json', 'User-Agent': 'TransitBuddy/1.0' },
        signal: AbortSignal.timeout(8000)
      });
      if (res.status === 403 || res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        lastError = new Error(`Citybus HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`Citybus HTTP ${res.status}`);
      const json = await res.json();
      const data = json.data ?? [];
      if (!Array.isArray(data) || !data.length) {
        lastError = new Error('Citybus empty');
        continue;
      }
      return cache.set(key, data, ttlMs);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function citybusRoutes(cache) {
  try {
    const rows = await cityFetch('/route/CTB', cache, 12 * 60 * 60 * 1000);
    const services = [];
    for (const x of rows) {
      services.push({
        co: 'CTB',
        route: x.route,
        bound: 'O',
        service_type: '1',
        orig_en: x.orig_en,
        dest_en: x.dest_en,
        orig_tc: x.orig_tc,
        dest_tc: x.dest_tc
      });
      services.push({
        co: 'CTB',
        route: x.route,
        bound: 'I',
        service_type: '1',
        orig_en: x.dest_en,
        dest_en: x.orig_en,
        orig_tc: x.dest_tc,
        dest_tc: x.orig_tc
      });
    }
    return services;
  } catch {
    return [];
  }
}

function citybusName(value, stopId) {
  const text = String(value || '').trim();
  if (!text || text === String(stopId)) return '';
  return text;
}

export async function citybusStop(cache, stopId) {
  const empty = { stop: stopId, name_tc: '', name_en: '', lat: null, long: null, co: 'CTB' };
  try {
    const data = await cityFetch(`/stop/${encodeURIComponent(stopId)}`, cache, STOP_TTL);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.stop) return empty;
    const name_tc = citybusName(row.name_tc, stopId) || citybusName(row.name_en, stopId);
    const name_en = citybusName(row.name_en, stopId) || name_tc;
    return {
      stop: row.stop,
      name_tc,
      name_en,
      lat: row.lat,
      long: row.long,
      co: 'CTB'
    };
  } catch {
    return empty;
  }
}

export async function citybusRouteStops(cache, service, stopMap) {
  const dir = service.bound === 'I' ? 'inbound' : 'outbound';
  try {
    const rows = await cityFetch(
      `/route-stop/CTB/${encodeURIComponent(service.route)}/${dir}`,
      cache,
      ROUTE_STOP_TTL
    );
    const seq = [...rows].sort((a, b) => a.seq - b.seq);
    return mapPool(seq, 8, async (row) => {
      const known = lookupStopMap(stopMap, row.stop, 'CTB');
      const meta = known && !stopNameMissing(known) ? known : await citybusStop(cache, row.stop);
      return {
        ...row,
        ...meta,
        stop: row.stop,
        seq: row.seq,
        co: 'CTB',
        name_tc: meta.name_tc || '',
        name_en: meta.name_en || ''
      };
    });
  } catch {
    return [];
  }
}

export async function citybusStopEta(cache, stopId, route) {
  try {
    const rows = await cityFetch(
      `/eta/CTB/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}`,
      cache,
      ETA_TTL
    );
    return (rows || []).filter((x) => x.eta).map((x) => ({
      ...x,
      co: 'CTB',
      service_type: '1',
      dir: x.dir,
      dest_tc: x.dest_tc || x.dest || '',
      dest_en: x.dest_en || x.dest || ''
    }));
  } catch {
    return [];
  }
}

export async function citybusStopEtas(cache, stopId) {
  const key = `ctb-batch-eta:${stopId}`;
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(`${BATCH}/stop-eta/CTB/${encodeURIComponent(stopId)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'TransitBuddy/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`Citybus batch HTTP ${res.status}`);
    const json = await res.json();
    const rows = (json.data || []).filter((x) => x.eta).map((x) => ({
      co: 'CTB',
      route: x.route,
      dir: x.dir,
      service_type: '1',
      eta: x.eta,
      dest_en: x.dest_en || x.dest || '',
      dest_tc: x.dest_tc || x.dest || '',
      stop: x.stop || stopId
    }));
    return cache.set(key, rows, ETA_TTL);
  } catch {
    return [];
  }
}

export async function citybusAllStops(cache, routes) {
  const jobs = [];
  const seen = new Set();
  for (const r of routes || []) {
    if (r.co !== 'CTB') continue;
    const key = `${r.route}|${r.bound}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push(r);
  }
  const ids = new Set();
  await mapPool(jobs, 8, async (r) => {
    const dir = r.bound === 'I' ? 'inbound' : 'outbound';
    try {
      const rows = await cityFetch(
        `/route-stop/CTB/${encodeURIComponent(r.route)}/${dir}`,
        cache,
        ROUTE_STOP_TTL
      );
      for (const row of rows || []) {
        if (row.stop) ids.add(row.stop);
      }
    } catch {}
  });
  const stops = await mapPool([...ids], 8, (id) => citybusStop(cache, id));
  return stops.filter((stop) => stop && stop.stop);
}
