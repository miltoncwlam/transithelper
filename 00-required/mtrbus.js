/** MTR Bus / Feeder Bus live schedule. POST-only official API; empty body = empty UI. */
const BASE = 'https://rt.data.gov.hk/v1/transport/mtr/bus/getSchedule';
const TTL = 8 * 1000;
const STOP_TTL = 24 * 60 * 60 * 1000;

export const MTR_BUS_ROUTES = [
  ['K12', '大埔墟站', '八號花園', 'Tai Po Market Station', 'Eightland Garden'],
  ['K14', '大埔超級城', '大埔墟站', 'Tai Po Mega Mall', 'Tai Po Market Station'],
  ['K17', '大埔墟站', '富善', 'Tai Po Market Station', 'Fu Shin'],
  ['K18', '大埔墟站', '廣福', 'Tai Po Market Station', 'Kwong Fuk'],
  ['506', '屯門碼頭', '兆麟', 'Tuen Mun Ferry Pier', 'Siu Lun'],
  ['K51', '富泰', '大欖', 'Fu Tai', 'Tai Lam'],
  ['K51A', '富泰', '掃管笏', 'Fu Tai', 'So Kwun Wat'],
  ['K52', '悅湖山莊', '龍鼓灘', 'Yuet Wu Villa', 'Lung Kwu Tan'],
  ['K52A', '屯門站', '曾咀', 'Tuen Mun Station', 'Tsang Tsui'],
  ['K53', '屯門站', '掃管笏', 'Tuen Mun Station', 'So Kwun Wat'],
  ['K54', '和田邨', '屯門市中心', 'Wo Tin Estate', 'Tuen Mun Town Centre'],
  ['K58', '富泰', '掃管笏', 'Fu Tai', 'So Kwun Wat'],
  ['K65', '元朗站', '流浮山', 'Yuen Long Station', 'Lau Fau Shan'],
  ['K65A', '天水圍站', '流浮山', 'Tin Shui Wai Station', 'Lau Fau Shan'],
  ['K66', '朗屏', '大棠黃泥墩村', 'Long Ping', 'Tai Tong Wong Nai Tun Tsuen'],
  ['K68', '元朗工業邨', '元朗公園', 'Yuen Long Industrial Estate', 'Yuen Long Park'],
  ['K73', '天恆', '元朗西', 'Tin Heng', 'Yuen Long West'],
  ['K74', '天水圍市中心', '凹頭', 'Tin Shui Wai Town Centre', 'Au Tau'],
  ['K75A', '天水圍站', '洪水橋', 'Tin Shui Wai Station', 'Hung Shui Kiu'],
  ['K75P', '天瑞', '洪水橋', 'Tin Shui', 'Hung Shui Kiu'],
  ['K76', '天恆', '天水圍站', 'Tin Heng', 'Tin Shui Wai Station']
].map(([route, orig_tc, dest_tc, orig_en, dest_en]) => ({
  co: 'MTRB',
  route,
  bound: 'O',
  service_type: '1',
  orig_tc,
  dest_tc,
  orig_en,
  dest_en
}));

export function mtrBusDirectoryRoutes() {
  return MTR_BUS_ROUTES;
}

async function fetchSchedule(cache, routeName, ttlMs = TTL) {
  const route = String(routeName || '').toUpperCase();
  if (!route) return null;
  const key = `mtrb:${route}`;
  const cached = cache?.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'TransitBuddy/1.0' },
      body: JSON.stringify({ language: 'zh', routeName: route }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return cache?.set ? cache.set(key, null, 4000) : null;
    const json = await res.json();
    return cache?.set ? cache.set(key, json, ttlMs) : json;
  } catch {
    return null;
  }
}

function parseSeconds(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function etaFromBus(bus) {
  if (bus?.isScheduled === '1') return null;
  const sec = parseSeconds(bus?.arrivalTimeInSecond);
  if (sec == null) {
    const dep = parseSeconds(bus?.departureTimeInSecond);
    if (dep == null) return null;
    return new Date(Date.now() + dep * 1000).toISOString();
  }
  return new Date(Date.now() + sec * 1000).toISOString();
}

export function mtrBusStopsFromSchedule(payload, routeName) {
  const route = String(routeName || payload?.routeName || '').toUpperCase();
  return (payload?.busStop || []).map((row, i) => ({
    stop: String(row.busStopId || ''),
    seq: i + 1,
    co: 'MTRB',
    name_tc: row.busStopNameChi || row.busStopNameEng || '',
    name_en: row.busStopNameEng || row.busStopNameChi || '',
    lat: row.latitude != null ? Number(row.latitude) : null,
    long: row.longitude != null ? Number(row.longitude) : null,
    route
  })).filter((row) => row.stop);
}

export async function mtrBusRouteStops(cache, service) {
  const route = String(service?.route || service || '');
  const payload = await fetchSchedule(cache, route, STOP_TTL);
  return mtrBusStopsFromSchedule(payload, route);
}

export async function mtrBusStopEtas(cache, stop, routes) {
  const id = String(stop?.stop || stop || '');
  const hinted = String(stop?.route || '').toUpperCase();
  const names = hinted
    ? [hinted]
    : [...new Set((routes || []).filter((row) => String(row.co).toUpperCase() === 'MTRB').map((row) => String(row.route).toUpperCase()))];
  const out = [];
  for (const route of names.slice(0, 8)) {
    const payload = await fetchSchedule(cache, route);
    const row = (payload?.busStop || []).find((item) => String(item.busStopId) === id);
    if (!row) continue;
    for (const bus of row.bus || []) {
      const eta = etaFromBus(bus);
      if (!eta) continue;
      out.push({
        co: 'MTRB',
        route,
        dir: 'O',
        eta,
        dest_tc: bus.destinationChi || bus.dest_ch || '',
        dest_en: bus.destinationEng || bus.dest_en || '',
        rmk_tc: bus.isScheduled === '1' ? '時間表' : '',
        rmk_en: bus.isScheduled === '1' ? 'Scheduled' : ''
      });
    }
  }
  return out;
}
