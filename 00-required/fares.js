import { getSupabase, getSupabaseAdmin } from './supabase.js';

let index = null;
let loading = null;

function norm(value) {
  return String(value || '').trim().toUpperCase();
}

function placeKey(value) {
  return String(value || '').normalize('NFKC').replace(/\s*\([^)]*\)\s*/g, '').replace(/[\s–—_.,'"-]+/g, '').toLowerCase();
}

function companyParts(code) {
  return norm(code).split(/[+\/]/).map((part) => part.trim()).filter(Boolean);
}

function appCompanies(route) {
  const co = norm(route?.co || 'KMB');
  if (co === 'CTB') return ['CTB'];
  if (co === 'LWB') return ['LWB', 'KMB'];
  if (co === 'NLB') return ['NLB'];
  if (co === 'GMB') return ['GMB'];
  return ['KMB', 'LWB'];
}

function scoreFare(row, route) {
  let score = 0;
  const cos = new Set(appCompanies(route));
  if (companyParts(row.company_code).some((code) => cos.has(code))) score += 4;
  const bound = route?.bound === 'I' || route?.bound === 'inbound' ? 'I' : route?.bound === 'O' || route?.bound === 'outbound' ? 'O' : null;
  if (bound && row.bound === bound) score += 2;
  const orig = placeKey(route?.orig_tc || route?.orig_en);
  const dest = placeKey(route?.dest_tc || route?.dest_en || route?.dest?.zh || route?.dest?.en);
  if (orig && (placeKey(row.orig_zh) === orig || placeKey(row.orig_en) === orig || placeKey(row.dest_zh) === orig || placeKey(row.dest_en) === orig)) score += 1;
  if (dest && (placeKey(row.dest_zh) === dest || placeKey(row.dest_en) === dest || placeKey(row.orig_zh) === dest || placeKey(row.orig_en) === dest)) score += 1;
  return score;
}

function buildIndex(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = norm(row.route_name || row.route_name_en);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

async function downloadPublicJson(file) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  const res = await fetch(`${url.replace(/\/$/, '')}/storage/v1/object/public/${file}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) return null;
  return res.json();
}

async function downloadStorageJson(sb, bucket, file) {
  if (!sb) return null;
  const downloaded = await sb.storage.from(bucket).download(file);
  if (downloaded.error || !downloaded.data) return null;
  return JSON.parse(await downloaded.data.text());
}

async function fetchRows() {
  const sb = getSupabaseAdmin() || getSupabase();
  const section = await downloadStorageJson(sb, 'bus-fares', 'routes.json')
    || await downloadPublicJson('bus-fares/routes.json');
  if (Array.isArray(section) && section.length) return section;

  if (sb) {
    const fromTable = await sb.from('bus_fare_routes').select('route_id,route_seq,bound,company_code,route_name,route_name_en,journey_time_minutes,full_fare_hkd,orig_zh,orig_en,dest_zh,dest_en,stop_count,section_prices,section_fares').limit(10000);
    if (!fromTable.error && fromTable.data?.length) return fromTable.data;
    const tdTable = await sb.from('td_bus_routes').select('route_id,route_seq,bound,company_code,route_name,route_name_en,service_mode,journey_time_minutes,full_fare_hkd,orig_zh,orig_en,dest_zh,dest_en,stop_count').limit(10000);
    if (!tdTable.error && tdTable.data?.length) return tdTable.data;
    const file = await downloadStorageJson(sb, 'td-bus', 'routes.json');
    if (Array.isArray(file) && file.length) return file;
  }
  const tdFile = await downloadPublicJson('td-bus/routes.json');
  return Array.isArray(tdFile) ? tdFile : [];
}

export async function getFareIndex() {
  if (index) return index;
  if (!loading) {
    loading = fetchRows()
      .then((rows) => {
        index = buildIndex(rows);
        return index;
      })
      .catch(() => {
        index = new Map();
        return index;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

export const getTdFareIndex = getFareIndex;

export function lookupFare(fareIndex, route) {
  if (!route?.route || !fareIndex) return null;
  const rows = fareIndex.get(norm(route.route));
  if (!rows?.length) return null;
  let best = rows[0];
  let bestScore = -1;
  for (const row of rows) {
    const score = scoreFare(row, route);
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}

export function sectionFareHkd(row, onSeq, offSeq) {
  const lanes = row?.section_fares;
  if (!Array.isArray(lanes) || !lanes.length) return null;
  const on = Math.max(1, Number(onSeq) || 1);
  if (offSeq != null && offSeq !== '' && Number(offSeq) <= on) return null;
  const lane = lanes[on - 1];
  if (!Array.isArray(lane) || !lane.length) return null;
  if (offSeq == null || offSeq === '') {
    for (let i = lane.length - 1; i >= 0; i -= 1) {
      if (lane[i] != null) return Number(lane[i]);
    }
    return null;
  }
  const off = Number(offSeq);
  if (!Number.isFinite(off) || off <= on) return null;
  const price = lane[off - on - 1];
  return price == null ? null : Number(price);
}

export function faresAlongFrom(row, onSeq) {
  const n = Number(row?.stop_count) || (row?.section_fares || []).length || 0;
  const on = Math.max(1, Number(onSeq) || 1);
  const out = [];
  for (let off = on + 1; off <= n; off += 1) out.push(sectionFareHkd(row, on, off));
  return out;
}

export function faresToTerminusBySeq(row) {
  const n = Number(row?.stop_count) || (row?.section_fares || []).length || 0;
  const out = [];
  for (let on = 1; on <= n; on += 1) out.push(sectionFareHkd(row, on, null));
  return out;
}

export function fareFields(row, extra = {}) {
  if (!row) return {};
  const hasBoard = extra.on_seq != null && extra.on_seq !== '';
  const section = hasBoard ? sectionFareHkd(row, extra.on_seq, extra.off_seq) : null;
  const terminus = hasBoard ? sectionFareHkd(row, extra.on_seq, null) : null;
  return {
    td_route_id: row.route_id || undefined,
    full_fare_hkd: row.full_fare_hkd == null ? null : Number(row.full_fare_hkd),
    journey_time_minutes: row.journey_time_minutes == null ? null : Number(row.journey_time_minutes),
    section_fare_hkd: extra.off_seq ? section : (terminus ?? section),
    fares_from_board: hasBoard ? faresAlongFrom(row, extra.on_seq) : undefined,
    terminus_fares: extra.withTerminus ? faresToTerminusBySeq(row) : undefined
  };
}

export async function attachFaresToRoutes(routes) {
  const fareIndex = await getFareIndex();
  if (!fareIndex.size) return routes;
  return (routes || []).map((route) => ({ ...route, ...fareFields(lookupFare(fareIndex, route)) }));
}

export async function attachFaresToItems(list) {
  const fareIndex = await getFareIndex();
  if (!fareIndex.size) return list;
  return (list || []).map((item) => ({
    ...item,
    ...fareFields(lookupFare(fareIndex, item), { on_seq: item.on_seq, off_seq: item.off_seq })
  }));
}

export async function fareForRoute(route, onSeq, offSeq) {
  const fareIndex = await getFareIndex();
  const row = lookupFare(fareIndex, route);
  if (!row) return null;
  return {
    route_id: row.route_id,
    route_seq: row.route_seq,
    company_code: row.company_code,
    route_name: row.route_name,
    bound: row.bound,
    orig_zh: row.orig_zh,
    orig_en: row.orig_en,
    dest_zh: row.dest_zh,
    dest_en: row.dest_en,
    stop_count: row.stop_count,
    ...fareFields(row, { on_seq: onSeq, off_seq: offSeq, withTerminus: true })
  };
}
