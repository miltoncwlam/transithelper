import { stopPlaceKey } from './kmb.js';
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
  const co = String(stop?.co || '').toUpperCase();
  if (co === 'CTB' || co === 'GMB' || co === 'NLB' || co === 'LWB' || co === 'KMB' || co === 'MTRB') return co;
  if (stop?.gmb_route_id) return 'GMB';
  if (stop?.nlb_route_id) return 'NLB';
  const id = String(stop?.stop || stop || '');
  if (/^\d{6}$/.test(id)) return 'CTB';
  if (/^\d{7,}$/.test(id)) return 'GMB';
  return 'KMB';
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

const stopCatalog = new Map();

function rememberStop(stop) {
  if (!stop?.stop) return stop;
  const prev = stopCatalog.get(String(stop.stop));
  const next = {
    stop: String(stop.stop),
    name_tc: citybusName(stop.name_tc, stop.stop) || prev?.name_tc || '',
    name_en: citybusName(stop.name_en, stop.stop) || prev?.name_en || '',
    lat: stop.lat ?? prev?.lat ?? null,
    long: stop.long ?? prev?.long ?? null,
    co: 'CTB'
  };
  if (!stopNameMissing(next) || next.lat != null) stopCatalog.set(String(next.stop), next);
  return next;
}

function payloadFromJson(json) {
  if (json == null) return null;
  if (Array.isArray(json)) return json;
  if (Object.prototype.hasOwnProperty.call(json, 'data')) return json.data;
  return json;
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
        signal: AbortSignal.timeout(15000)
      });
      if (res.status === 403 || res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        lastError = new Error(`Citybus HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`Citybus HTTP ${res.status}`);
      const data = payloadFromJson(await res.json());
      if (Array.isArray(data)) {
        if (!data.length) {
          lastError = new Error('Citybus empty');
          continue;
        }
        return cache.set(key, data, ttlMs);
      }
      if (data && typeof data === 'object') {
        return cache.set(key, data, ttlMs);
      }
      lastError = new Error('Citybus empty');
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function citybusStopCatalog(cache) {
  try {
    const rows = await cityFetch('/stop', cache, STOP_TTL);
    return (Array.isArray(rows) ? rows : []).map((row) => rememberStop({
      stop: String(row.stop || ''),
      name_tc: citybusName(row.name_tc, row.stop),
      name_en: citybusName(row.name_en, row.stop),
      lat: row.lat,
      long: row.long,
      co: 'CTB'
    })).filter((row) => row.stop);
  } catch {
    return [];
  }
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
  const remembered = stopCatalog.get(String(stopId));
  if (remembered && !stopNameMissing(remembered)) return remembered;
  try {
    const data = await cityFetch(`/stop/${encodeURIComponent(stopId)}`, cache, STOP_TTL);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.stop) return remembered || empty;
    return rememberStop({
      stop: row.stop,
      name_tc: citybusName(row.name_tc, stopId) || citybusName(row.name_en, stopId),
      name_en: citybusName(row.name_en, stopId) || citybusName(row.name_tc, stopId),
      lat: row.lat,
      long: row.long,
      co: 'CTB'
    });
  } catch {
    return remembered || empty;
  }
}

export async function citybusRouteStopSeq(cache, service) {
  const dir = service.bound === 'I' ? 'inbound' : 'outbound';
  try {
    const rows = await cityFetch(
      `/route-stop/CTB/${encodeURIComponent(service.route)}/${dir}`,
      cache,
      ROUTE_STOP_TTL
    );
    return [...(rows || [])].sort((a, b) => a.seq - b.seq);
  } catch {
    return [];
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
      const known = lookupStopMap(stopMap, row.stop, 'CTB') || stopCatalog.get(String(row.stop));
      const meta = known && !stopNameMissing(known) ? rememberStop(known) : await citybusStop(cache, row.stop);
      return {
        ...row,
        ...meta,
        stop: row.stop,
        seq: row.seq,
        co: 'CTB',
        name_tc: meta.name_tc || '',
        name_en: meta.name_en || '',
        lat: meta.lat ?? row.lat ?? null,
        long: meta.long ?? row.long ?? null
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

function metresBetweenStops(a, b) {
  const metres = Math.hypot(
    (Number(a.lat) - Number(b.lat)) * 111000,
    (Number(a.long) - Number(b.long)) * 102000
  );
  return Number.isFinite(metres) ? metres : Infinity;
}

const REGION_TEXT = [
  { key: 'tko', re: /將軍澳|坑口|調景嶺|寶琳|康城|翠林|尚德|Tseung Kwan O|Hang Hau|Tiu Keng Leng|Po Lam|LOHAS/i },
  { key: 'st', re: /沙田|第一城|火炭|大圍|馬鞍山|烏溪沙|圓洲角|石門|城門|廣源|City One|Sha Tin|Fo Tan|Ma On Shan|Tai Wai|Wu Kai Sha|Shek Mun/i },
  { key: 'hkie', re: /柴灣|小西灣|筲箕灣|西灣河|太古|鰂魚涌|杏花|康怡|北角|Chai Wan|Sai Wan Ho|Tai Koo|Quarry Bay|North Point/i },
  { key: 'kln', re: /觀塘|九龍灣|牛頭角|藍田|油塘|彩虹|黃大仙|鑽石山|Kwun Tong|Kowloon Bay|Lam Tin|Choi Hung/i },
  { key: 'hkiw', re: /中環|金鐘|灣仔|銅鑼灣|上環|西環|堅尼地城|Central|Admiralty|Wan Chai|Causeway/i },
  { key: 'ntn', re: /大埔|粉嶺|上水|大學|科學園|Tai Po|Fanling|Sheung Shui/i }
];

export function regionKeysFromText(text) {
  const raw = String(text || '');
  return REGION_TEXT.filter((row) => row.re.test(raw)).map((row) => row.key);
}

export function regionKeysFromCoords(lat, lng) {
  const y = Number(lat);
  const x = Number(lng);
  if (!Number.isFinite(y) || !Number.isFinite(x)) return [];
  const keys = [];
  if (x >= 114.239 && y >= 22.28 && y <= 22.368) keys.push('tko');
  if (y >= 22.36 && y <= 22.455 && x >= 114.16 && x <= 114.255) keys.push('st');
  if (y >= 22.255 && y <= 22.305 && x >= 114.20 && x <= 114.27) keys.push('hkie');
  if (y >= 22.30 && y <= 22.345 && x >= 114.18 && x <= 114.24) keys.push('kln');
  return keys;
}

export function regionKeysForStop(stop) {
  const fromText = regionKeysFromText(`${stop?.name_tc || ''}${stop?.name_en || ''}`);
  const fromCoords = regionKeysFromCoords(stop?.lat, stop?.long);
  return [...new Set([...fromText, ...fromCoords])];
}

export function regionKeysForService(service) {
  return regionKeysFromText(`${service?.orig_tc || ''}${service?.dest_tc || ''}${service?.orig_en || ''}${service?.dest_en || ''}`);
}

function regionSet(stops) {
  const keys = new Set();
  for (const stop of stops || []) {
    for (const key of regionKeysForStop(stop)) keys.add(key);
  }
  return keys;
}

export function scoreCitybusForJourney(service, originSeeds, destSeeds) {
  if (String(service?.co || '').toUpperCase() !== 'CTB') return 0;
  const routeKeys = new Set(regionKeysForService(service));
  const originKeys = regionSet(originSeeds);
  const destKeys = regionSet(destSeeds);
  const originHit = [...originKeys].some((key) => routeKeys.has(key));
  const destHit = [...destKeys].some((key) => routeKeys.has(key));
  let score = 0;
  if (originHit && destHit) score += 6;
  else if (originHit || destHit) score += 2;
  const blob = `${service.orig_tc || ''}${service.dest_tc || ''}${service.orig_en || ''}${service.dest_en || ''}`.replace(/\s/g, '');
  for (const seed of [...(originSeeds || []), ...(destSeeds || [])]) {
    const place = stopPlaceKey(seed);
    if (place && place.length >= 2 && blob.includes(place)) score += 3;
  }
  return score;
}

function poleNearSeeds(stop, seeds, radius) {
  return (seeds || []).some((seed) => {
    const metres = metresBetweenStops(stop, seed);
    if (Number.isFinite(metres) && metres <= radius) return true;
    const here = stopPlaceKey(stop);
    const there = stopPlaceKey(seed);
    return !!(here && there && here === there);
  });
}

/** Find Citybus poles at origin/dest places from route-stop, even when the /stop catalog is empty. */
export async function citybusPolesAtPlaces(cache, routes, originSeeds, destSeeds, opts = {}) {
  const radius = Math.max(150, Number(opts.radius) || 290);
  const loadSeq = opts.loadSeq || ((service) => citybusRouteStops(cache, service, opts.stopMap));
  const capRoutes = Math.min(8, Math.max(2, Number(opts.routeCap) || 8));
  const preferred = opts.preferred;
  const seen = new Set();
  const scored = [];
  for (const row of routes || []) {
    if (String(row.co || '').toUpperCase() !== 'CTB') continue;
    const key = `${String(row.route || '').toUpperCase()}|${row.bound || 'O'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let score = scoreCitybusForJourney(row, originSeeds, destSeeds);
    if (preferred && String(preferred.route || '').toUpperCase() === String(row.route || '').toUpperCase()) {
      const prefBound = preferred.bound || row.bound;
      if (!prefBound || String(prefBound) === String(row.bound || 'O')) score += 10;
    }
    if (score <= 0) continue;
    scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score || String(a.row.route).localeCompare(String(b.row.route)));
  const picked = scored.slice(0, capRoutes).map((item) => item.row);
  if (preferred && String(preferred.co || '').toUpperCase() === 'CTB' && preferred.route) {
    const prefKey = `${String(preferred.route).toUpperCase()}|${preferred.bound || 'O'}`;
    if (!picked.some((row) => `${String(row.route).toUpperCase()}|${row.bound || 'O'}` === prefKey)) {
      picked.unshift({ ...preferred, co: 'CTB' });
    }
  }
  const origin = new Map();
  const dest = new Map();
  const out = opts.out || { origin: [], dest: [] };
  const publish = () => {
    out.origin = [...origin.values()];
    out.dest = [...dest.values()];
  };
  await mapPool(picked.slice(0, capRoutes), 4, async (service) => {
    const seq = await loadSeq(service);
    for (const stop of seq || []) {
      if (!stop?.stop) continue;
      const pole = { ...stop, co: 'CTB' };
      if (origin.size < 8 && poleNearSeeds(pole, originSeeds, radius)) origin.set(String(pole.stop), pole);
      if (dest.size < 8 && poleNearSeeds(pole, destSeeds, radius)) dest.set(String(pole.stop), pole);
    }
    publish();
  });
  publish();
  return out;
}

function citybusConnectScore(row, destStops) {
  const blob = `${row.orig_tc || ''}${row.dest_tc || ''}${row.orig_en || ''}${row.dest_en || ''}`;
  const dest = (destStops || []).map((d) => `${d.name_tc || ''}${d.name_en || ''}`).join('');
  let score = 0;
  if (/馬鞍山|烏溪沙|沙田|大埔|粉嶺|上水|大學|火炭|大圍/.test(blob)) score += 2;
  if (/柴灣|小西灣|筲箕灣|西灣河|太古|鰂魚涌|杏花|康怡|北角/.test(blob)) score += 2;
  if (/太古|康怡|鰂魚涌|西灣河|柴灣|Cityplaza|Tai Koo/.test(dest)
    && /柴灣|太古|西灣河|鰂魚涌|康怡|杏花|Chai Wan|Tai Koo/.test(blob)) score += 2;
  return score;
}

export async function citybusStopsNearSeeds(cache, routes, seeds, destStops, radius) {
  try {
    const cap = Math.max(80, Number(radius) || 250);
    const scored = [];
    const seen = new Set();
    for (const row of routes || []) {
      if (String(row.co || '').toUpperCase() !== 'CTB') continue;
      const key = `${String(row.route || '').toUpperCase()}|${row.bound}`;
      if (seen.has(key)) continue;
      const score = citybusConnectScore(row, destStops);
      if (score < 3) continue;
      seen.add(key);
      scored.push({ row, score });
    }
    scored.sort((a, b) => b.score - a.score || String(a.row.route).localeCompare(String(b.row.route)));
    const picked = scored.slice(0, 4).map((x) => x.row);
    const found = new Map();
    await mapPool(picked, 4, async (service) => {
      if (found.size >= 2) return;
      const seq = await citybusRouteStopSeq(cache, service);
      if (!seq.length) return;
      const mid = Math.floor(seq.length * 0.42);
      const sample = seq.slice(Math.max(0, mid - 4), Math.min(seq.length, mid + 6));
      await mapPool(sample, 8, async (row) => {
        if (found.size >= 2) return;
        const meta = await citybusStop(cache, row.stop);
        if (meta?.lat == null || !seeds?.some((seed) => metresBetweenStops(meta, seed) <= cap)) return;
        found.set(String(meta.stop), { ...meta, co: 'CTB' });
      });
    });
    return [...found.values()];
  } catch {
    return [];
  }
}

export async function citybusAllStops(cache, routes, { limit = 40 } = {}) {
  const jobs = [];
  const seen = new Set();
  for (const r of routes || []) {
    if (r.co !== 'CTB') continue;
    const key = `${r.route}|${r.bound}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push(r);
    if (jobs.length >= limit) break;
  }
  const nested = await mapPool(jobs, 4, (r) => citybusRouteStops(cache, r, null));
  const stops = new Map();
  for (const rows of nested) {
    for (const row of rows || []) {
      if (!row?.stop) continue;
      const prev = stops.get(String(row.stop));
      if (!prev || stopNameMissing(prev)) stops.set(String(row.stop), rememberStop(row));
    }
  }
  return [...stops.values()];
}
