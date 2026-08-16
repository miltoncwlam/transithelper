const BASE = 'https://rt.data.gov.hk/v2/transport/citybus';

async function cityFetch(path, cache, ttlMs) {
  const key = `ctb:${path}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const res = await fetch(BASE + path, {
    cache: 'no-store',
    headers: { Accept: 'application/json', 'User-Agent': 'TransitBuddy/1.0' },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`Citybus HTTP ${res.status}`);
  const json = await res.json();
  const data = json.data || [];
  return cache.set(key, data, ttlMs);
}

export async function citybusRoutes(cache) {
  try {
    const rows = await cityFetch('/route/CTB', cache, 12 * 60 * 60 * 1000);
    return rows.map((x) => ({
      co: 'CTB',
      route: x.route,
      bound: x.bound === 'I' || x.bound === 'inbound' ? 'I' : 'O',
      service_type: '1',
      orig_en: x.orig_en,
      dest_en: x.dest_en,
      orig_tc: x.orig_tc,
      dest_tc: x.dest_tc
    }));
  } catch {
    return [];
  }
}

export async function citybusRouteStops(cache, service) {
  const dir = service.bound === 'I' ? 'inbound' : 'outbound';
  try {
    const rows = await cityFetch(
      `/route-stop/CTB/${encodeURIComponent(service.route)}/${dir}`,
      cache,
      24 * 60 * 60 * 1000
    );
    return [...rows].sort((a, b) => a.seq - b.seq).map((row) => ({
      ...row,
      stop: row.stop,
      name_en: row.name_en,
      name_tc: row.name_tc,
      lat: row.lat,
      long: row.long
    }));
  } catch {
    return [];
  }
}

export async function citybusStopEta(cache, stopId, route) {
  try {
    const rows = await cityFetch(
      `/eta/CTB/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}`,
      cache,
      8 * 1000
    );
    return rows;
  } catch {
    return [];
  }
}
