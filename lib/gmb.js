/** Green Minibus live data from data.etagmb.gov.hk. */
const BASE = 'https://data.etagmb.gov.hk';
const REGIONS = ['HKI', 'KLN', 'NT'];
const STOP_TTL = 24 * 60 * 60 * 1000;
const ETA_TTL = 8 * 1000;

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
  if (!res.ok) throw new Error(`GMB HTTP ${res.status}`);
  const json = await res.json();
  const data = json.data ?? json;
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
    for (const eta of etas) {
      const ts = eta.timestamp || eta.eta || eta.time;
      if (!ts) continue;
      const routeSeq = block.route_seq ?? service?.gmb_route_seq ?? 1;
      out.push({
        eta: ts,
        eta_seq: Number(eta.eta_seq) || out.length + 1,
        dest_tc: block.dest_tc || eta.dest_tc || service?.dest_tc || '',
        dest_en: block.dest_en || eta.dest_en || service?.dest_en || '',
        route: block.route_code || block.route || service?.route,
        dir: Number(routeSeq) === 1 ? 'O' : 'I',
        co: 'GMB'
      });
    }
  }
  return out;
}

export async function gmbRoutes(cache) {
  try {
    const regions = await gmbGet('/route', cache, 12 * 60 * 60 * 1000);
    const out = [];
    for (const [region, list] of Object.entries(typeof regions === 'object' ? regions : {})) {
      if (!Array.isArray(list)) continue;
      for (const route of list) {
        out.push({
          co: 'GMB',
          route: String(route),
          bound: 'O',
          service_type: '1',
          orig_en: region,
          dest_en: region,
          orig_tc: region,
          dest_tc: region
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function asDirections(item) {
  if (Array.isArray(item?.directions) && item.directions.length) return item.directions;
  if (Array.isArray(item)) return item;
  return [];
}

export async function gmbLookup(cache, routeCode) {
  const code = String(routeCode || '').trim();
  if (!code) return [];
  const out = [];
  await Promise.all(REGIONS.map(async (region) => {
    try {
      const data = await gmbGet(
        `/route/${region}/${encodeURIComponent(code)}`,
        cache,
        12 * 60 * 60 * 1000
      );
      const items = Array.isArray(data) ? data : (data ? [data] : []);
      for (const item of items) {
        const directions = asDirections(item);
        if (!directions.length) {
          out.push({
            co: 'GMB',
            route: item.route_code || code,
            bound: 'O',
            service_type: '1',
            gmb_route_id: item.route_id,
            gmb_route_seq: 1,
            gmb_region: region,
            orig_en: item.description_en || region,
            dest_en: item.description_en || region,
            orig_tc: item.description_tc || region,
            dest_tc: item.description_tc || region
          });
          continue;
        }
        directions.forEach((dir, idx) => {
          out.push({
            co: 'GMB',
            route: item.route_code || code,
            bound: idx === 0 || String(dir.route_seq) === '1' ? 'O' : 'I',
            service_type: '1',
            gmb_route_id: item.route_id,
            gmb_route_seq: dir.route_seq ?? idx + 1,
            gmb_region: region,
            orig_en: dir.orig_en || dir.orig_tc || '',
            dest_en: dir.dest_en || dir.dest_tc || '',
            orig_tc: dir.orig_tc || dir.orig_en || '',
            dest_tc: dir.dest_tc || dir.dest_en || ''
          });
        });
      }
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

export async function gmbRouteStops(cache, service) {
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
