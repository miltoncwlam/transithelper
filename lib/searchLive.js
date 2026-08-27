import { capExactServices, collectMatchingServices, directoryKeep, exactMatchingServices, n, sortLiveChoices } from './routeSearch.js';
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

function sameBound(etaDir, bound) {
  const a = String(etaDir || '').toUpperCase();
  const b = String(bound || '').toUpperCase();
  if (a === b) return true;
  if ((a === 'O' || a === 'OUTBOUND') && (b === 'O' || b === 'OUTBOUND')) return true;
  if ((a === 'I' || a === 'INBOUND') && (b === 'I' || b === 'INBOUND')) return true;
  return false;
}

function asRows(data) {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
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
    etas.set(key, asRows(rows));
  });
  return services.map((service) => {
    const key = `${n(service.route)}|${service.service_type || 1}`;
    const live = (etas.get(key) || []).filter((row) => row.eta && sameBound(row.dir, service.bound));
    return { x: service, live, seq: [{}] };
  });
}

async function kmbRouteMeta(cache, route, bound, serviceType) {
  const data = await kmbFetchOrEmpty(`/route/${encodeURIComponent(route)}/${bound}/${serviceType}`, cache, 6 * 60 * 60 * 1000);
  const row = asRows(data)[0];
  if (!row?.route) return null;
  return {
    co: row.co || 'KMB',
    route: n(row.route),
    bound: bound === 'inbound' ? 'I' : 'O',
    service_type: String(row.service_type || serviceType),
    orig_tc: row.orig_tc || '',
    dest_tc: row.dest_tc || '',
    orig_en: row.orig_en || '',
    dest_en: row.dest_en || ''
  };
}

function servicesFromEta(q, rows) {
  const byKey = new Map();
  for (const row of asRows(rows)) {
    const dir = String(row.dir || '').toUpperCase();
    if (!dir) continue;
    const bound = dir.startsWith('I') ? 'I' : 'O';
    const st = String(row.service_type || '1');
    const key = `${bound}|${st}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        x: {
          co: row.co || 'KMB',
          route: q,
          bound,
          service_type: st,
          orig_tc: '',
          dest_tc: row.dest_tc || '',
          orig_en: '',
          dest_en: row.dest_en || ''
        },
        live: [],
        seq: [{}]
      });
    }
    if (row.eta) byKey.get(key).live.push(row);
  }
  return [...byKey.values()];
}

export async function probeKmbRoute(cache, routeStr) {
  const q = n(routeStr);
  if (!q) return { error: 'noRoute', keep: [], auto: null };
  const [etaRows, outbound, inbound] = await Promise.all([
    kmbFetchOrEmpty(`/route-eta/${encodeURIComponent(q)}/1`, cache, ETA_TTL),
    kmbRouteMeta(cache, q, 'outbound', '1'),
    kmbRouteMeta(cache, q, 'inbound', '1')
  ]);
  const byBound = new Map();
  for (const service of [outbound, inbound].filter(Boolean)) {
    byBound.set(service.bound, { x: service, live: [], seq: [{}] });
  }
  for (const z of servicesFromEta(q, etaRows)) {
    const cur = byBound.get(z.x.bound);
    if (cur) {
      cur.live = z.live;
      if (!cur.x.dest_tc) cur.x.dest_tc = z.x.dest_tc;
      if (!cur.x.dest_en) cur.x.dest_en = z.x.dest_en;
    } else {
      byBound.set(z.x.bound, z);
    }
  }
  if (!byBound.size) return { error: 'noRoute', keep: [], auto: null };
  return toKeep(q, [...byBound.values()]);
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

function withBudget(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve([]), ms))
  ]);
}

export function keepFromDirectory(directory, routeStr) {
  const listed = directoryKeep(directory.routes || [], routeStr);
  if (!listed.keep.length) return listed;
  return toKeep(routeStr, listed.keep.map((z) => ({ x: z.service, live: [], seq: [{}] })));
}

export async function searchLive(cache, directory, routeStr) {
  const q = n(routeStr);
  if (!q) return { error: 'noRoute', keep: [], auto: null };

  const exact = exactMatchingServices(directory.routes || [], q);

  const kmbish = exact.filter((row) => {
    const co = serviceCo(row);
    return co === 'KMB' || co === 'LWB';
  });
  const listed = exact.filter((row) => serviceCo(row) !== 'KMB' && serviceCo(row) !== 'LWB');
  const needGmb = !exact.some((row) => serviceCo(row) === 'GMB' && row.gmb_route_id);
  const haveFranchised = exact.some((row) => ['KMB', 'LWB', 'CTB'].includes(serviceCo(row)));
  const haveOther = exact.some((row) => ['KMB', 'LWB', 'CTB', 'NLB'].includes(serviceCo(row)));
  const gmbMs = needGmb ? (haveFranchised ? 2500 : haveOther ? 0 : 5000) : 0;
  const gmbPromise = gmbMs
    ? withBudget(gmbLookup(cache, q).catch(() => []), gmbMs)
    : Promise.resolve([]);
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
  const gmbInfo = capExactServices(extraGmb).map((row) => ({ x: row, live: [], seq: [{}] }));
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
