import { collectMatchingServices, n, sortLiveChoices } from './routeSearch.js';
import { kmbFetchOrEmpty } from './kmb.js';
import { citybusRouteStopSeq, citybusStopEta } from './citybus.js';
import { gmbLookup, gmbRouteStops, gmbStopEta } from './gmb.js';
import { nlbEta, nlbRouteStops } from './nlb.js';

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withBudget(promise, ms, fallback) {
  return Promise.race([
    promise,
    sleep(ms).then(() => fallback)
  ]);
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

async function probeNlb(cache, service) {
  const seq = await nlbRouteStops(cache, service);
  if (!seq.length) return { x: service, live: [], seq };
  const probes = [seq[0], seq[Math.floor(seq.length / 2)], seq[seq.length - 1]]
    .filter(Boolean)
    .filter((row, i, all) => all.findIndex((other) => other.stop === row.stop) === i);
  for (const stop of probes) {
    const live = await nlbEta(cache, stop, service);
    if (live.length) return { x: service, live, seq };
  }
  return { x: service, live: [], seq };
}

async function probe(cache, service) {
  const co = serviceCo(service);
  try {
    if (co === 'NLB') return await probeNlb(cache, service);
    if (co === 'GMB') {
      const seq = await gmbRouteStops(cache, service, { skipCoords: true });
      const first = seq[0];
      const live = first ? await gmbStopEta(cache, first, service) : [];
      return { x: service, live, seq };
    }
    if (co === 'CTB') {
      const seq = await citybusRouteStopSeq(cache, service);
      const first = seq[0];
      const live = first?.stop ? await citybusStopEta(cache, first.stop, service.route) : [];
      return { x: service, live, seq };
    }
    const rows = await kmbFetchOrEmpty(
      `/route-eta/${encodeURIComponent(service.route)}/${service.service_type || 1}`,
      cache,
      ETA_TTL
    );
    const live = (rows || []).filter((row) => row.eta && row.dir === service.bound);
    return { x: service, live, seq: live.length ? [{}] : [] };
  } catch {
    return { x: service, live: [], seq: [] };
  }
}

function toKeep(query, info) {
  const live = info.filter((z) => z.live.length);
  const idle = info.filter((z) => !z.live.length && (z.seq.length || ['KMB', 'LWB', 'NLB'].includes(serviceCo(z.x))));
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

export async function searchLive(cache, directory, routeStr) {
  const q = n(routeStr);
  if (!q) return { error: 'noRoute', keep: [], auto: null };

  const fromDir = collectMatchingServices(directory.routes || [], q)
    .filter((row) => n(row.route) === q)
    .filter((row) => serviceCo(row) !== 'GMB' || row.gmb_route_id);
  const exact = capExact(fromDir);

  const gmbPromise = gmbLookup(cache, q).catch(() => []);
  const [dirInfo, gmbRows] = await Promise.all([
    exact.length ? mapPool(exact, 5, (row) => probe(cache, row)) : Promise.resolve([]),
    gmbPromise
  ]);
  const extraGmb = [];
  const seen = new Set(exact.map(serviceKey));
  for (const row of gmbRows || []) {
    if (n(row.route) !== q || !row.gmb_route_id || seen.has(serviceKey(row))) continue;
    seen.add(serviceKey(row));
    extraGmb.push(row);
  }
  const gmbCap = capExact(extraGmb);
  const gmbFallback = gmbCap.map((row) => ({ x: row, live: [], seq: [{}] }));
  const gmbInfo = gmbCap.length
    ? await withBudget(mapPool(gmbCap, 4, (row) => probe(cache, row)), 3500, gmbFallback)
    : [];
  const info = [...dirInfo, ...gmbInfo];
  const result = toKeep(q, info);
  if (result.keep.some((z) => z.live.length) || result.keep.length) return result;

  const variants = collectMatchingServices(directory.routes || [], q)
    .filter((row) => n(row.route) !== q)
    .filter((row) => serviceCo(row) !== 'GMB' || row.gmb_route_id)
    .slice(0, 6);
  if (!variants.length) return result;
  const variantInfo = await mapPool(variants, 4, (row) => probe(cache, row));
  return toKeep(q, variantInfo.filter((z) => z.live.length));
}
