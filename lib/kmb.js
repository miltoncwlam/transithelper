const BASE = 'https://data.etabus.gov.hk/v1/transport/kmb';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function kmbFetch(path, cache, ttlMs) {
  const key = `kmb:${path}`;
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
      if (!res.ok) throw new Error(`KMB HTTP ${res.status}`);
      const json = await res.json();
      const data = json.data || [];
      return cache.set(key, data, ttlMs);
    } catch (error) {
      lastError = error;
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function kmbFetchOrEmpty(path, cache, ttlMs) {
  try {
    return await kmbFetch(path, cache, ttlMs);
  } catch {
    return [];
  }
}

export function nearestStops(allStops, lat, lng, radius = 250, limit = 20) {
  const originLat = Number(lat);
  const originLng = Number(lng);
  if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) return [];
  const cap = Math.min(800, Math.max(150, Number(radius) || 250));
  const max = Math.min(80, Math.max(1, Number(limit) || 20));
  return (allStops || [])
    .map((stop) => {
      const metres = Math.hypot(
        (Number(stop.lat) - originLat) * 111000,
        (Number(stop.long) - originLng) * 102000
      );
      return { ...stop, metres };
    })
    .filter((stop) => Number.isFinite(stop.metres) && stop.metres <= cap)
    .sort((a, b) => a.metres - b.metres)
    .slice(0, max)
    .map((stop) => ({
      stop: stop.stop,
      name_tc: stop.name_tc,
      name_en: stop.name_en,
      lat: stop.lat,
      long: stop.long,
      co: stop.co || 'KMB',
      metres: Math.round(stop.metres)
    }));
}

export function expandNearby(seedStops, allStops, radius) {
  const found = new Map();
  for (const seed of seedStops) {
    found.set(seed.stop, seed);
    const lat = Number(seed.lat);
    const lng = Number(seed.long);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    for (const stop of allStops) {
      const dLat = (Number(stop.lat) - lat) * 111000;
      const dLng = (Number(stop.long) - lng) * 102000;
      if (Math.hypot(dLat, dLng) <= radius) found.set(stop.stop, stop);
    }
  }
  return [...found.values()];
}

export function attachStopMeta(routeStops, stopMap) {
  return [...routeStops]
    .sort((a, b) => a.seq - b.seq)
    .map((row) => Object.assign({}, row, stopMap.get(row.stop) || stopMap.get(`KMB:${row.stop}`) || {}));
}

export function clusterEtas(etas, gapMs = 90000) {
  const times = [...new Set(etas)].sort((a, b) => new Date(a) - new Date(b));
  return times.filter((time, i) => !i || new Date(time) - new Date(times[i - 1]) > gapMs);
}

export function namedStop(stop) {
  const id = String(stop?.stop || '');
  const tc = String(stop?.name_tc || stop?.zh || '').trim();
  const en = String(stop?.name_en || stop?.en || '').trim();
  const missing = !stop || ((!tc && !en) || (id && tc === id && (!en || en === id)));
  if (missing) return { zh: '車站', en: 'Stop' };
  return { zh: tc || en, en: en || tc };
}

/** Same BBI / area after stripping bay codes such as (TA750). */
export function stopPlaceKey(stop) {
  const name = stop?.name_tc || stop?.name_en || stop?.zh || stop?.en || '';
  return String(name).normalize('NFKC').replace(/\s*\([^)]*\)\s*/g, '').replace(/[\s–—_.,'"-]+/g, '').toLowerCase();
}
