/** Green Minibus live data from data.etagmb.gov.hk. */
const BASE = 'https://data.etagmb.gov.hk';
const REGIONS = ['HKI', 'KLN', 'NT'];
const STOP_TTL = 24 * 60 * 60 * 1000;
const ETA_TTL = 8 * 1000;

export const GMB_REGION = {
  HKI: { zh: '港島', en: 'Hong Kong Island' },
  KLN: { zh: '九龍', en: 'Kowloon' },
  NT: { zh: '新界', en: 'New Territories' }
};

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

async function gmbGet(path, cache, ttlMs) {
  const key = `gmb:${path}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const res = await fetch(BASE + path, {
    cache: 'no-store',
    headers: { Accept: 'application/json', 'User-Agent': 'TransitBuddy/1.0' },
    signal: AbortSignal.timeout(8000)
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GMB HTTP ${res.status}`);
  const json = await res.json();
  const data = json.data ?? json;
  if (data == null || (Array.isArray(data) && !data.length)) return data;
  return cache.set(key, data, ttlMs);
}

function stopIdOf(stop) {
  if (stop && typeof stop === 'object') return String(stop.stop || stop.stop_id || '');
  return String(stop || '');
}

function stopSeqOf(stop) {
  if (stop && typeof stop === 'object') return stop.seq || stop.stop_seq || null;
  return null;
}

function parseGmbEtas(data, service = null) {
  const blocks = Array.isArray(data) ? data : (data ? [data] : []);
  const out = [];
  for (const block of blocks) {
    if (block.enabled === false) continue;
    const etas = Array.isArray(block.eta) ? block.eta : (block.timestamp ? [block] : []);
    const routeSeq = block.route_seq ?? service?.gmb_route_seq ?? 1;
    for (const eta of etas) {
      const ts = eta.timestamp || eta.eta || eta.time;
      if (!ts) continue;
      out.push({
        eta: ts,
        eta_seq: Number(eta.eta_seq) || out.length + 1,
        dest_tc: block.dest_tc || eta.dest_tc || service?.dest_tc || '',
        dest_en: block.dest_en || eta.dest_en || service?.dest_en || '',
        route: block.route_code || block.route || service?.route,
        dir: Number(routeSeq) === 1 ? 'O' : 'I',
        co: 'GMB',
        gmb_route_id: block.route_id || service?.gmb_route_id,
        gmb_route_seq: routeSeq,
        remark_tc: eta.remarks_tc || '',
        remark_en: eta.remarks_en || ''
      });
    }
  }
  return out;
}

function servicesFromItem(region, code, item) {
  const regionName = GMB_REGION[region] || { zh: region, en: region };
  const directions = asDirections(item);
  const route = item.route_code || code;
  if (!directions.length) {
    return [{
      co: 'GMB',
      route,
      bound: 'O',
      service_type: '1',
      gmb_route_id: item.route_id,
      gmb_route_seq: 1,
      gmb_region: region,
      orig_en: item.description_en || regionName.en,
      dest_en: item.description_en || regionName.en,
      orig_tc: item.description_tc || regionName.zh,
      dest_tc: item.description_tc || regionName.zh
    }];
  }
  return directions.map((dir, idx) => ({
    co: 'GMB',
    route,
    bound: idx === 0 || String(dir.route_seq) === '1' ? 'O' : 'I',
    service_type: '1',
    gmb_route_id: item.route_id,
    gmb_route_seq: dir.route_seq ?? idx + 1,
    gmb_region: region,
    orig_en: dir.orig_en || dir.orig_tc || '',
    dest_en: dir.dest_en || dir.dest_tc || '',
    orig_tc: dir.orig_tc || dir.orig_en || '',
    dest_tc: dir.dest_tc || dir.dest_en || ''
  }));
}

export async function gmbRouteJobs(cache) {
  try {
    const data = await gmbGet('/route', cache, 12 * 60 * 60 * 1000);
    const routes = data?.routes || {};
    const jobs = [];
    for (const region of REGIONS) {
      for (const code of routes[region] || []) {
        jobs.push({ region, code: String(code) });
      }
    }
    return jobs;
  } catch {
    return [];
  }
}

export async function gmbRoutes(cache) {
  const jobs = await gmbRouteJobs(cache);
  const regionName = (region) => GMB_REGION[region] || { zh: region, en: region };
  return jobs.map(({ region, code }) => ({
    co: 'GMB',
    route: code,
    bound: 'O',
    service_type: '1',
    gmb_region: region,
    orig_en: regionName(region).en,
    dest_en: regionName(region).en,
    orig_tc: regionName(region).zh,
    dest_tc: regionName(region).zh
  }));
}

export async function gmbHydrateServices(cache, opts = {}) {
  const jobs = await gmbRouteJobs(cache);
  const cap = Math.max(1, Number(opts.limit) || jobs.length);
  const nested = await mapPool(jobs.slice(0, cap), 6, async ({ region, code }) => {
    try {
      const data = await gmbGet(
        `/route/${region}/${encodeURIComponent(code)}`,
        cache,
        12 * 60 * 60 * 1000
      );
      const items = Array.isArray(data) ? data : (data ? [data] : []);
      return items.flatMap((item) => servicesFromItem(region, code, item));
    } catch {
      return [];
    }
  });
  return nested.flat();
}

export async function gmbAllStops(cache, services) {
  const jobs = [];
  const seen = new Set();
  for (const s of services || []) {
    const key = `${s.gmb_route_id}|${s.gmb_route_seq}`;
    if (!s.gmb_route_id || seen.has(key)) continue;
    seen.add(key);
    jobs.push(s);
  }
  const stops = new Map();
  await mapPool(jobs, 6, async (service) => {
    const rows = await gmbRouteStops(cache, service);
    for (const row of rows) {
      if (row.stop && !stops.has(row.stop)) stops.set(row.stop, row);
    }
  });
  return [...stops.values()];
}

function asDirections(item) {
  if (Array.isArray(item?.directions) && item.directions.length) return item.directions;
  if (Array.isArray(item)) return item;
  return [];
}

export async function gmbLookup(cache, routeCode) {
  const code = String(routeCode || '').trim();
  if (!code) return [];
  const jobs = await gmbRouteJobs(cache);
  const needle = code.toUpperCase();
  let targets = jobs.filter((job) => String(job.code).toUpperCase() === needle);
  if (!targets.length && !jobs.length) {
    targets = REGIONS.map((region) => ({ region, code }));
  }
  if (!targets.length) return [];
  const out = [];
  await Promise.all(targets.map(async ({ region, code: regionCode }) => {
    try {
      const data = await gmbGet(
        `/route/${region}/${encodeURIComponent(regionCode)}`,
        cache,
        12 * 60 * 60 * 1000
      );
      const items = Array.isArray(data) ? data : (data ? [data] : []);
      for (const item of items) out.push(...servicesFromItem(region, regionCode, item));
    } catch {
      // region has no matching route
    }
  }));
  return out;
}

async function gmbStopCoords(cache, stopId) {
  try {
    const data = await gmbGet(`/stop/${encodeURIComponent(stopId)}`, cache, STOP_TTL);
    const wgs = data?.coordinates?.wgs84;
    const lat = Number(wgs?.latitude);
    const lng = Number(wgs?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, long: lng };
  } catch {
    return null;
  }
}

export async function gmbRouteStops(cache, service, opts = {}) {
  if (!service?.gmb_route_id || !service?.gmb_route_seq) return [];
  try {
    const data = await gmbGet(
      `/route-stop/${encodeURIComponent(service.gmb_route_id)}/${encodeURIComponent(service.gmb_route_seq)}`,
      cache,
      STOP_TTL
    );
    const rows = data?.route_stops || data || [];
    const mapped = (Array.isArray(rows) ? rows : []).map((row, i) => ({
      stop: String(row.stop_id || row.stop || i),
      seq: row.stop_seq || row.seq || i + 1,
      name_en: row.name_en,
      name_tc: row.name_tc,
      lat: row.lat,
      long: row.long || row.lng,
      co: 'GMB'
    }));
    if (opts.skipCoords) return mapped;
    await mapPool(mapped, 8, async (row) => {
      if (Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.long))) return row;
      const coords = await gmbStopCoords(cache, row.stop);
      if (coords) {
        row.lat = coords.lat;
        row.long = coords.long;
      }
      return row;
    });
    return mapped;
  } catch {
    return [];
  }
}

export async function gmbStopEta(cache, stop, service = null) {
  const stopId = stopIdOf(stop);
  const stopSeq = stopSeqOf(stop) || service?.stop_seq || service?.stopSeq;
  const routeId = service?.gmb_route_id;
  const routeSeq = service?.gmb_route_seq;
  if (!stopId && !routeId) return [];
  try {
    let path;
    if (routeId && stopSeq) {
      path = `/eta/route-stop/${encodeURIComponent(routeId)}/${encodeURIComponent(routeSeq || 1)}/${encodeURIComponent(stopSeq)}`;
    } else if (routeId && stopId) {
      path = `/eta/route-stop/${encodeURIComponent(routeId)}/${encodeURIComponent(stopId)}`;
    } else {
      path = `/eta/stop/${encodeURIComponent(stopId)}`;
    }
    const data = await gmbGet(path, cache, ETA_TTL);
    return parseGmbEtas(data, service);
  } catch {
    return [];
  }
}
