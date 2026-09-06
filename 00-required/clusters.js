/** Co-located poles: ~50 m and heading within 45°, same bay, different operator ids. */
import { stopPlaceKey } from './kmb.js';

export const CLUSTER_METRES = 50;
export const HEADING_DEG = 45;

export function metresBetween(a, b) {
  const lat1 = Number(a?.lat);
  const lng1 = Number(a?.long ?? a?.lng);
  const lat2 = Number(b?.lat);
  const lng2 = Number(b?.long ?? b?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  return Math.hypot((lat1 - lat2) * 111000, (lng1 - lng2) * 102000);
}

export function headingDegrees(from, to) {
  const dy = (Number(to?.lat) - Number(from?.lat)) * 111000;
  const dx = (Number(to?.long ?? to?.lng) - Number(from?.long ?? from?.lng)) * 102000;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return null;
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

export function headingDiff(a, b) {
  if (a == null || b == null) return 0;
  let d = Math.abs(Number(a) - Number(b)) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function circularMean(degs) {
  if (!degs?.length) return null;
  let x = 0;
  let y = 0;
  for (const d of degs) {
    const rad = Number(d) * Math.PI / 180;
    x += Math.cos(rad);
    y += Math.sin(rad);
  }
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function uidOf(stop, co) {
  const company = String(co || stop?.co || 'KMB').toUpperCase();
  const id = String(stop?.stop || stop || '');
  return `${company}:${id}`;
}

export function stopHeadingsFromGraph(graph) {
  const lists = new Map();
  for (const svc of graph?.services || []) {
    const uids = svc.stopUids || [];
    for (let i = 0; i < uids.length - 1; i += 1) {
      const from = graph.stops?.[uids[i]];
      const to = graph.stops?.[uids[i + 1]];
      const h = headingDegrees(from, to);
      if (h == null) continue;
      if (!lists.has(uids[i])) lists.set(uids[i], []);
      lists.get(uids[i]).push(h);
    }
  }
  const out = {};
  for (const [uid, degs] of lists) {
    const mean = circularMean(degs);
    if (mean != null) out[uid] = mean;
  }
  return out;
}

function cellKey(stop, cellM) {
  return `${Math.round(Number(stop.lat) * 111000 / cellM)}:${Math.round(Number(stop.long ?? stop.lng) * 102000 / cellM)}`;
}

export function emptyClusterIndex() {
  return { byUid: {}, members: {}, headings: {} };
}

export function buildClusters(stops, opts = {}) {
  const headings = opts.headings || {};
  const list = (stops || []).filter((stop) => (
    stop?.stop && Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.long ?? stop.lng))
  ));
  const parent = list.map((_, i) => i);
  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(i, j) {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[a] = b;
  }

  const cell = 40;
  const buckets = new Map();
  list.forEach((stop, i) => {
    const key = cellKey(stop, cell);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  });

  function neighborIdx(stop) {
    const iy = Math.round(Number(stop.lat) * 111000 / cell);
    const ix = Math.round(Number(stop.long ?? stop.lng) * 102000 / cell);
    const out = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const hits = buckets.get(`${iy + dy}:${ix + dx}`);
        if (hits) out.push(...hits);
      }
    }
    return out;
  }

  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    const ha = headings[uidOf(a)];
    for (const j of neighborIdx(a)) {
      if (j <= i) continue;
      const b = list[j];
      if (metresBetween(a, b) > CLUSTER_METRES) continue;
      if (headingDiff(ha, headings[uidOf(b)]) > HEADING_DEG) continue;
      union(i, j);
    }
  }

  const groups = new Map();
  list.forEach((stop, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(stop);
  });

  const index = emptyClusterIndex();
  index.headings = { ...headings };
  let n = 0;
  for (const members of groups.values()) {
    const id = `c${n}`;
    n += 1;
    index.members[id] = members.map((stop) => uidOf(stop));
    for (const stop of members) index.byUid[uidOf(stop)] = id;
  }
  return index;
}

export function lookupStopUid(allStops, uid) {
  const raw = String(uid || '');
  const m = /^(KMB|LWB|CTB|GMB|NLB|MTRB):(.+)$/i.exec(raw);
  const co = m ? m[1].toUpperCase() : null;
  const id = m ? m[2] : raw;
  return (allStops || []).find((row) => (
    String(row.stop) === id && (!co || String(row.co || 'KMB').toUpperCase() === co)
  )) || (allStops || []).find((row) => String(row.stop) === id);
}

export function expandByClusters(seeds, index, allStops) {
  if (!index?.byUid || !seeds?.length) return seeds || [];
  const lookup = new Map();
  for (const stop of allStops || []) lookup.set(uidOf(stop), stop);
  const out = [];
  const seen = new Set();
  const push = (stop) => {
    if (!stop?.stop) return;
    const key = uidOf(stop);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(stop);
  };
  for (const seed of seeds) {
    push(seed);
    const cid = index.byUid[uidOf(seed)];
    for (const uid of index.members[cid] || []) {
      const hit = lookup.get(uid) || lookupStopUid(allStops, uid);
      if (hit) push({ ...hit, co: hit.co || uid.split(':')[0] });
    }
  }
  return out;
}

export function clusterHasCo(index, seeds, co, allStops) {
  const want = String(co || '').toUpperCase();
  for (const stop of expandByClusters(seeds, index, allStops)) {
    if (String(stop.co || '').toUpperCase() === want) return true;
  }
  return false;
}

export function clusterLabel(stops, lang = 'zh') {
  const first = (stops || [])[0];
  if (!first) return '';
  const tc = String(first.name_tc || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const en = String(first.name_en || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  return lang === 'en' ? (en || tc) : (tc || en);
}

export function placeKeyOf(stop) {
  return stopPlaceKey(stop);
}
