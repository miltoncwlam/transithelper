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
    .map((row) => Object.assign({}, row, stopMap.get(row.stop) || {}));
}

export function clusterEtas(etas, gapMs = 90000) {
  const times = [...new Set(etas)].sort((a, b) => new Date(a) - new Date(b));
  return times.filter((time, i) => !i || new Date(time) - new Date(times[i - 1]) > gapMs);
}

export function namedStop(stop) {
  if (!stop) return { zh: '車站', en: 'Stop' };
  return {
    zh: stop.name_tc || stop.name_en || '車站',
    en: stop.name_en || stop.name_tc || 'Stop'
  };
}
