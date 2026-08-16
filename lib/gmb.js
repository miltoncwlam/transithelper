/** Green Minibus live data from data.etagmb.gov.hk. */
const BASE = 'https://data.etagmb.gov.hk';
const REGIONS = ['HKI', 'KLN', 'NT'];

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

export async function gmbRouteStops(cache, service) {
  if (!service?.gmb_route_id || !service?.gmb_route_seq) return [];
  try {
    const data = await gmbGet(
      `/route-stop/${encodeURIComponent(service.gmb_route_id)}/${encodeURIComponent(service.gmb_route_seq)}`,
      cache,
      24 * 60 * 60 * 1000
    );
    const rows = data?.route_stops || data || [];
    return (Array.isArray(rows) ? rows : []).map((row, i) => ({
      stop: String(row.stop_id || row.stop || i),
      seq: row.stop_seq || row.seq || i + 1,
      name_en: row.name_en,
      name_tc: row.name_tc,
      lat: row.lat,
      long: row.long || row.lng
    }));
  } catch {
    return [];
  }
}

export async function gmbStopEta(cache, stopId) {
  try {
    const data = await gmbGet(
      `/eta/route-stop/${encodeURIComponent(stopId)}`,
      cache,
      8 * 1000
    );
    const list = Array.isArray(data) ? data : (data?.eta || []);
    return list.flatMap((row) => {
      const etas = Array.isArray(row.eta) ? row.eta : (row.timestamp ? [row] : []);
      return etas.map((eta) => ({
        eta: eta.timestamp || eta.eta || eta.time,
        dest_tc: row.dest_tc || eta.dest_tc,
        dest_en: row.dest_en || eta.dest_en,
        route: row.route_code || row.route,
        dir: row.route_seq === 1 ? 'O' : 'I'
      })).filter((x) => x.eta);
    });
  } catch {
    return [];
  }
}
