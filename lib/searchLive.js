import { collectMatchingServices, n, sortLiveChoices } from './routeSearch.js';
import { kmbFetchOrEmpty } from '../00-required/kmb.js';
import { gmbLookup } from '../00-required/gmb.js';

const ETA_TTL = 8 * 1000;

function serviceCo(row) {
  if (row?.co) return String(row.co).toUpperCase();
  if (row?.gmb_route_id) return 'GMB';
  if (row?.nlb_route_id) return 'NLB';
  return 'KMB';
}

function serviceKey(row) {
  return [
    serviceCo(row),
    n(row.route),
    row.bound,
    row.service_type,
    row.gmb_route_id || '',
    row.nlb_route_id || ''
  ].join('|');
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

function capExact(rows) {
  const byCo = new Map();
  const out = [];
  for (const row of rows || []) {
    const co = serviceCo(row);
    const n = (byCo.get(co) || 0) + 1;
    if (n > 6) continue;
    byCo.set(co, n);
    out.push(row);
  }
  return out;
}

async function probeKmbBatch(cache, services) {
  const groups = new Map();
  for (const service of services) {
    const key = `${n(service.route)}|${service.service_type || 1}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(service);
  }
  const etas = new Map();
  await mapPool([...groups.keys()], 3, async (key) => {
    const [route, st] = key.split('|');
    const rows = await kmbFetchOrEmpty(`/route-eta/${encodeURIComponent(route)}/${st}`, cache, ETA_TTL);
    etas.set(key, rows || []);
  });
  return services.map((service) => {
    const key = `${n(service.route)}|${service.service_type || 1}`;
    const live = (etas.get(key) || []).filter((row) => row.eta && row.dir === service.bound);
    return { x: service, live, seq: live.length ? [{}] : [] };
  });
}

function toKeep(query, info) {
  const live = info.filter((z) => z.live.length);
  const idle = info.filter((z) => !z.live.length && (z.seq.length || ['KMB', 'LWB', 'CTB', 'NLB', 'GMB'].includes(serviceCo(z.x))));
  const ordered = [...live, ...idle];
  if (!ordered.length) {
    if (info.length) return { error: 'noLiveNow', keep: [], auto: null };
    return { error: 'noRoute', keep: [], auto: null };
  }
  const keep = sortLiveChoices(query, ordered.map((z) => ({
    service: z.x,
    live: z.live,
    companies: [serviceCo(z.x)],
    shortDests: [],
    note: '',
    hasVariants: false
  })));
  return {
    keep,
    auto: keep.length === 1 ? keep[0].service : null
  };
}

export function keepFromDirectory(directory, routeStr) {
  const q = n(routeStr);
  if (!q) return { error: 'noRoute', keep: [], auto: null };
  const fromDir = collectMatchingServices(directory.routes || [], q)
    .filter((row) => n(row.route) === q)
    .filter((row) => serviceCo(row) !== 'GMB' || row.gmb_route_id);
  const exact = capExact(fromDir);
  if (!exact.length) return { error: 'noRoute', keep: [], auto: null };
  return toKeep(q, exact.map((row) => ({ x: row, live: [], seq: [{}] })));
}

export async function searchLive(cache, directory, routeStr) {
  const q = n(routeStr);
  if (!q) return { error: 'noRoute', keep: [], auto: null };

  const fromDir = collectMatchingServices(directory.routes || [], q)
    .filter((row) => n(row.route) === q)
    .filter((row) => serviceCo(row) !== 'GMB' || row.gmb_route_id);
  const exact = capExact(fromDir);

  const kmbish = exact.filter((row) => {
    const co = serviceCo(row);
    return co === 'KMB' || co === 'LWB';
  });
  const listed = exact.filter((row) => serviceCo(row) !== 'KMB' && serviceCo(row) !== 'LWB');
  const needGmb = !exact.some((row) => ['KMB', 'LWB', 'CTB', 'NLB'].includes(serviceCo(row)));
  const gmbPromise = needGmb ? gmbLookup(cache, q).catch(() => []) : Promise.resolve([]);
  const [kmbInfo, gmbRows] = await Promise.all([
    kmbish.length ? probeKmbBatch(cache, kmbish) : Promise.resolve([]),
    gmbPromise
  ]);
  const extraGmb = [];
  const seen = new Set(exact.map(serviceKey));
  for (const row of gmbRows || []) {
    if (n(row.route) !== q || !row.gmb_route_id || seen.has(serviceKey(row))) continue;
    seen.add(serviceKey(row));
    extraGmb.push(row);
  }
  const listedInfo = listed.map((row) => ({ x: row, live: [], seq: [{}] }));
  const gmbInfo = capExact(extraGmb).map((row) => ({ x: row, live: [], seq: [{}] }));
  const info = [...kmbInfo, ...listedInfo, ...gmbInfo];
  const result = toKeep(q, info);
  if (result.keep.some((z) => z.live.length) || result.keep.length) return result;

  const variants = collectMatchingServices(directory.routes || [], q)
    .filter((row) => n(row.route) !== q)
    .filter((row) => serviceCo(row) !== 'GMB' || row.gmb_route_id)
    .slice(0, 6);
  if (!variants.length) return result;
  const vkmb = variants.filter((row) => ['KMB', 'LWB'].includes(serviceCo(row)));
  const variantInfo = vkmb.length ? await probeKmbBatch(cache, vkmb) : [];
  return toKeep(q, variantInfo.filter((z) => z.live.length));
}
