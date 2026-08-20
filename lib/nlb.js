/** New Lantao Bus live data from rt.data.gov.hk v2. */
const BASE = 'https://rt.data.gov.hk/v2/transport/nlb';
const ROUTE_TTL = 12 * 60 * 60 * 1000;
const STOP_TTL = 24 * 60 * 60 * 1000;
const ETA_TTL = 8 * 1000;

let stopIndex = new Map();

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

async function nlbGet(path, cache, ttlMs) {
  const key = `nlb:${path}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const res = await fetch(BASE + path, {
    cache: 'no-store',
    headers: { Accept: 'application/json', 'User-Agent': 'TransitBuddy/1.0' },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`NLB HTTP ${res.status}`);
  const json = await res.json();
  return cache.set(key, json, ttlMs);
}

function splitName(name) {
  const raw = String(name || '');
  const parts = raw.split(/\s*>\s*/);
  if (parts.length >= 2) return { orig: parts[0].trim(), dest: parts.slice(1).join(' > ').trim() };
  return { orig: raw, dest: raw };
}

function toIso(value) {
  if (!value) return null;
  const raw = String(value).trim().replace(' ', 'T');
  const stamped = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}+08:00`;
  const date = new Date(stamped);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function rememberNlbStopService(stopId, service) {
  const id = String(stopId || '');
  if (!id || !service?.nlb_route_id) return;
  if (!stopIndex.has(id)) stopIndex.set(id, []);
  const list = stopIndex.get(id);
  if (!list.some((row) => String(row.nlb_route_id) === String(service.nlb_route_id))) list.push(service);
}

export async function nlbRoutes(cache) {
  try {
    const json = await nlbGet('/route.php?action=list', cache, ROUTE_TTL);
    return (json.routes || []).map((row) => {
      const zh = splitName(row.routeName_c);
      const en = splitName(row.routeName_e);
      return {
        co: 'NLB',
        route: String(row.routeNo || ''),
        bound: 'O',
        service_type: '1',
        nlb_route_id: String(row.routeId),
        orig_tc: zh.orig,
        dest_tc: zh.dest,
        orig_en: en.orig,
        dest_en: en.dest,
        overnight: Number(row.overnightRoute) === 1
      };
    });
  } catch {
    return [];
  }
}

export async function nlbRouteStops(cache, service) {
  const routeId = service?.nlb_route_id;
  if (!routeId) return [];
  try {
    const json = await nlbGet(
      `/stop.php?action=list&routeId=${encodeURIComponent(routeId)}`,
      cache,
      STOP_TTL
    );
    const rows = (json.stops || []).map((row, i) => {
      const stop = {
        stop: String(row.stopId),
        seq: i + 1,
        name_tc: row.stopName_c || row.stopLocation_c || row.stopName_e,
        name_en: row.stopName_e || row.stopName_c,
        lat: Number(row.latitude),
        long: Number(row.longitude),
        co: 'NLB'
      };
      rememberNlbStopService(stop.stop, service);
      return stop;
    });
    return rows;
  } catch {
    return [];
  }
}

export async function nlbAllStops(cache, routes) {
  const jobs = [];
  const seen = new Set();
  for (const r of routes || []) {
    if (r.co !== 'NLB' || !r.nlb_route_id || seen.has(r.nlb_route_id)) continue;
    seen.add(r.nlb_route_id);
    jobs.push(r);
  }
  const stops = new Map();
  await mapPool(jobs, 6, async (service) => {
    const rows = await nlbRouteStops(cache, service);
    for (const row of rows) {
      if (row.stop && !stops.has(row.stop)) stops.set(row.stop, row);
    }
  });
  return [...stops.values()];
}

export async function nlbEta(cache, stop, service) {
  const stopId = typeof stop === 'object' ? stop.stop : stop;
  const routeId = service?.nlb_route_id;
  if (!stopId || !routeId) return [];
  try {
    const json = await nlbGet(
      `/stop.php?action=estimatedArrivals&routeId=${encodeURIComponent(routeId)}&stopId=${encodeURIComponent(stopId)}&language=zh`,
      cache,
      ETA_TTL
    );
    return (json.estimatedArrivals || [])
      .map((row, i) => {
        const eta = toIso(row.estimatedArrivalTime);
        if (!eta) return null;
        const scheduled = String(row.departed) !== '1' || String(row.noGPS) === '1';
        return {
          eta,
          eta_seq: i + 1,
          dest_tc: service?.dest_tc || '',
          dest_en: service?.dest_en || '',
          via_tc: row.routeVariantName || '',
          route: service?.route,
          dir: 'O',
          co: 'NLB',
          nlb_route_id: String(routeId),
          remark_tc: scheduled ? '預定班次' : '',
          remark_en: scheduled ? 'Scheduled' : '',
          wheelchair: Number(row.wheelChair) === 1
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function nlbStopEtas(cache, stop, routes) {
  const stopId = String(typeof stop === 'object' ? stop.stop : stop || '');
  let services = stopIndex.get(stopId) || [];
  if (!services.length) {
    services = (routes || []).filter((row) => row.co === 'NLB' && row.nlb_route_id);
  }
  const lists = await mapPool(services, 4, (service) => nlbEta(cache, stopId, service));
  return lists.flat();
}
