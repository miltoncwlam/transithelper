/** Deterministic operator-qualified route-stop graph for journey shortlisting. */
import { citybusRouteStopSeq, citybusStopCatalog } from './citybus.js';
import { buildClusters, emptyClusterIndex, stopHeadingsFromGraph } from './clusters.js';
import { gmbHydrateServices, gmbRouteStops } from './gmb.js';
import { kmbFetchOrEmpty, stopPlaceKey } from './kmb.js';
import { nlbRouteStops } from './nlb.js';
import { addStops } from './addStops.js';
import { readSnapshot, writeSnapshot } from '../lib/snapshotStore.js';

const FILE = 'transitbuddy-topology.json';
const VERSION = 2;
const TTL_MS = 12 * 60 * 60 * 1000;
const ROUTE_STOP_TTL = 24 * 60 * 60 * 1000;

let graph = emptyGraph();
let loading = null;
let building = null;

export function emptyGraph() {
  return {
    version: VERSION,
    savedAt: 0,
    complete: { kmb: false, ctb: false, gmb: false, nlb: false },
    progress: { ctb: 0, gmb: 0, nlb: 0 },
    stops: {},
    services: [],
    byStop: {},
    clusters: emptyClusterIndex()
  };
}

export function stopUid(stop, co) {
  const company = String(co || stop?.co || 'KMB').toUpperCase();
  const id = String(stop?.stop || stop || '');
  return `${company}:${id}`;
}

export function serviceUid(service) {
  const co = String(service?.co || 'KMB').toUpperCase();
  return [
    co,
    String(service?.route || '').toUpperCase(),
    service?.bound || 'O',
    String(service?.service_type || '1'),
    service?.gmb_route_id || '',
    service?.gmb_route_seq || '',
    service?.nlb_route_id || ''
  ].join('|');
}

export function parseStopRef(ref) {
  if (ref && typeof ref === 'object') {
    return { co: String(ref.co || 'KMB').toUpperCase(), stop: String(ref.stop || '') };
  }
  const raw = String(ref || '');
  const m = /^(KMB|LWB|CTB|GMB|NLB|MTRB):(.+)$/i.exec(raw);
  if (m) return { co: m[1].toUpperCase(), stop: m[2] };
  return { co: null, stop: raw };
}

function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx], idx);
    }
  }
  return Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, worker)).then(() => out);
}

export function addGraphStop(target, stop) {
  if (!stop?.stop) return null;
  const uid = stopUid(stop);
  const prev = target.stops[uid] || {};
  target.stops[uid] = {
    uid,
    stop: String(stop.stop),
    co: String(stop.co || prev.co || 'KMB').toUpperCase(),
    name_tc: stop.name_tc || prev.name_tc || '',
    name_en: stop.name_en || prev.name_en || '',
    lat: stop.lat ?? prev.lat ?? null,
    long: stop.long ?? prev.long ?? null,
    area: stopPlaceKey(stop) || prev.area || ''
  };
  return uid;
}

export function addGraphService(target, service, seq) {
  const uid = serviceUid(service);
  const stopUids = [];
  const stopSeqs = [];
  for (const row of seq || []) {
    const sid = addGraphStop(target, { ...row, co: row.co || service.co });
    if (sid) {
      stopUids.push(sid);
      stopSeqs.push(row.seq ?? row.stop_seq ?? stopUids.length);
    }
  }
  if (!stopUids.length) return -1;
  let idx = target.services.findIndex((row) => row.uid === uid);
  const row = {
    uid,
    co: String(service.co || 'KMB').toUpperCase(),
    route: service.route,
    bound: service.bound || 'O',
    service_type: String(service.service_type || '1'),
    gmb_route_id: service.gmb_route_id || '',
    gmb_route_seq: service.gmb_route_seq || '',
    nlb_route_id: service.nlb_route_id || '',
    orig_tc: service.orig_tc || '',
    dest_tc: service.dest_tc || '',
    orig_en: service.orig_en || '',
    dest_en: service.dest_en || '',
    stopUids,
    stopSeqs
  };
  if (idx >= 0) target.services[idx] = row;
  else {
    idx = target.services.length;
    target.services.push(row);
  }
  for (const sid of stopUids) {
    if (!target.byStop[sid]) target.byStop[sid] = [];
    if (!target.byStop[sid].includes(idx)) target.byStop[sid].push(idx);
  }
  return idx;
}

export function servicesAtStop(target, uid) {
  return (target.byStop[uid] || []).map((i) => target.services[i]).filter(Boolean);
}

export function graphStopList(target) {
  return Object.values(target?.stops || {}).filter((stop) => stop?.stop);
}

function rememberStops(seq) {
  addStops((seq || []).filter((row) => row?.stop && (row.lat != null || row.long != null || row.name_tc)));
}

export function graphStats(target) {
  return {
    version: target.version,
    savedAt: target.savedAt,
    services: (target.services || []).length,
    stops: Object.keys(target.stops || {}).length,
    complete: { ...(target.complete || {}) },
    clusters: Object.keys(target?.clusters?.byUid || {}).length
  };
}

function refreshClusters(target) {
  const headings = stopHeadingsFromGraph(target);
  target.clusters = buildClusters(graphStopList(target), { headings });
  return target;
}

async function readFileGraph() {
  const raw = await readSnapshot(FILE);
  if (!raw || raw.version !== VERSION) return null;
  if (Date.now() - (raw.savedAt || 0) > TTL_MS) return null;
  if (!raw.clusters?.byUid) refreshClusters(raw);
  return raw;
}

async function writeFileGraph(target, opts = {}) {
  try {
    refreshClusters(target);
    target.savedAt = Date.now();
    await writeSnapshot(FILE, target, opts);
  } catch {}
}

function ingestKmbBulk(target, rows, stopMap) {
  const grouped = new Map();
  for (const row of rows || []) {
    const key = `${String(row.route || '').toUpperCase()}|${row.bound || 'O'}|${row.service_type || '1'}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  for (const [key, list] of grouped) {
    const [route, bound, service_type] = key.split('|');
    const seq = [...list].sort((a, b) => a.seq - b.seq).map((row) => {
      const meta = stopMap?.get(`KMB:${row.stop}`) || stopMap?.get(row.stop) || {};
      return { ...meta, ...row, co: meta.co || 'KMB' };
    });
    const first = seq[0] || {};
    const last = seq[seq.length - 1] || {};
    addGraphService(target, {
      co: first.co || 'KMB',
      route,
      bound,
      service_type,
      orig_tc: first.name_tc || '',
      dest_tc: last.name_tc || '',
      orig_en: first.name_en || '',
      dest_en: last.name_en || ''
    }, seq);
  }
  target.complete.kmb = true;
}

export async function getTopology() {
  if ((graph.services || []).length) return graph;
  const fromDisk = await readFileGraph();
  if (fromDisk) {
    graph = fromDisk;
    return graph;
  }
  return graph;
}

export function currentTopology() {
  return graph;
}

export function setTopologyForTests(next) {
  graph = next || emptyGraph();
}

async function buildSlice(cache, directory, started, budgetMs) {
  const remain = () => budgetMs - (Date.now() - started);
  if (!(graph.services || []).length) {
    const fromDisk = await readFileGraph();
    if (fromDisk) graph = fromDisk;
  }

  if (!graph.complete.kmb && remain() > 2000) {
    const rows = await kmbFetchOrEmpty('/route-stop', cache, ROUTE_STOP_TTL);
    if (rows.length) ingestKmbBulk(graph, rows, directory.stopMap);
    for (const stop of directory.stops || []) addGraphStop(graph, stop);
    await writeFileGraph(graph);
  }

  if (!graph.complete.ctb && remain() > 3000) {
    const catalog = await citybusStopCatalog(cache);
    for (const stop of catalog) addGraphStop(graph, stop);
    const jobs = [];
    const seen = new Set();
    for (const row of directory.routes || []) {
      if (String(row.co || '').toUpperCase() !== 'CTB') continue;
      const key = `${String(row.route || '').toUpperCase()}|${row.bound}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push(row);
    }
    const start = graph.progress.ctb || 0;
    const slice = jobs.slice(start, start + 48);
    await mapPool(slice, 8, async (service) => {
      const seq = await citybusRouteStopSeq(cache, service);
      const named = seq.map((row) => ({
        ...row,
        ...(graph.stops[stopUid(row, 'CTB')] || {}),
        co: 'CTB',
        stop: row.stop
      }));
      addGraphService(graph, service, named);
      rememberStops(named);
    });
    graph.progress.ctb = start + slice.length;
    if (jobs.length && graph.progress.ctb >= jobs.length) graph.complete.ctb = true;
    await writeFileGraph(graph);
  }

  if (!graph.complete.nlb && remain() > 3000) {
    const jobs = [];
    const seen = new Set();
    for (const row of directory.routes || []) {
      if (row.co !== 'NLB' || !row.nlb_route_id || seen.has(row.nlb_route_id)) continue;
      seen.add(row.nlb_route_id);
      jobs.push(row);
    }
    const start = graph.progress.nlb || 0;
    const slice = jobs.slice(start, start + 48);
    await mapPool(slice, 6, async (service) => {
      const seq = await nlbRouteStops(cache, service);
      addGraphService(graph, service, seq);
      rememberStops(seq);
    });
    graph.progress.nlb = start + slice.length;
    if (jobs.length && graph.progress.nlb >= jobs.length) graph.complete.nlb = true;
    await writeFileGraph(graph);
  }

  if (!graph.complete.gmb && remain() > 4000) {
    const jobs = [];
    const seen = new Set();
    for (const row of directory.routes || []) {
      if (String(row.co || '').toUpperCase() !== 'GMB' || !row.gmb_route_id) continue;
      const key = `${row.gmb_route_id}|${row.gmb_route_seq || 1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push(row);
    }
    const start = graph.progress.gmb || 0;
    const slice = (jobs.length ? jobs : await gmbHydrateServices(cache, { limit: start + 24 })).slice(start, start + 24);
    await mapPool(slice, 5, async (service) => {
      const seq = await gmbRouteStops(cache, service);
      addGraphService(graph, service, seq);
      rememberStops(seq);
    });
    graph.progress.gmb = start + slice.length;
    if (jobs.length && graph.progress.gmb >= jobs.length) graph.complete.gmb = true;
    await writeFileGraph(graph);
  }

  return graph;
}

export async function warmTopology(cache, directory, opts = {}) {
  if (building) return building;
  const budgetMs = Math.max(4000, Number(opts.budgetMs) || 45000);
  building = buildSlice(cache, directory, Date.now(), budgetMs)
    .then(async (next) => {
      await writeFileGraph(next, { remoteImmediately: !!opts.persistRemote });
      return next;
    })
    .catch(() => graph)
    .finally(() => { building = null; });
  return building;
}

export function startTopologyBuild(cache, directory) {
  if (building) return building;
  if (graph.complete?.kmb && graph.complete?.ctb && graph.complete?.gmb && graph.complete?.nlb) return Promise.resolve(graph);
  return warmTopology(cache, directory, { budgetMs: 12000 });
}

export async function ensureTopology(cache, directory) {
  if (loading) return loading;
  loading = (async () => {
    await getTopology();
    startTopologyBuild(cache, directory).catch(() => {});
    return graph;
  })().finally(() => { loading = null; });
  return loading;
}

/** Wait until the KMB route-stop graph is on this instance, or the budget runs out. */
export async function awaitKmbTopology(cache, directory, budgetMs = 8000) {
  await getTopology();
  if (graph.complete?.kmb && (graph.services || []).length) return graph;
  const ms = Math.max(500, Number(budgetMs) || 8000);
  const work = warmTopology(cache, directory, { budgetMs: Math.max(ms, 8000) });
  await Promise.race([
    work,
    new Promise((resolve) => setTimeout(() => resolve(graph), ms))
  ]);
  return graph;
}
