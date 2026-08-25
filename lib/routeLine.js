import { createCache } from './cache.js';
import { lineColorForCo } from './routeColors.js';

const UA = 'TransitBuddy/1.0 (https://hktransit.vercel.app)';
const TTL_MS = 12 * 60 * 60 * 1000;
const cache = createCache();

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

function escapeQl(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function fold(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[()（）[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validPoint(lat, lng) {
  const y = Number(lat);
  const x = Number(lng);
  if (!Number.isFinite(y) || !Number.isFinite(x)) return null;
  if (y < 22.1 || y > 22.6 || x < 113.7 || x > 114.5) return null;
  return [y, x];
}

function stopPoints(stops) {
  const out = [];
  for (const stop of stops || []) {
    const pt = validPoint(stop.lat, stop.lng ?? stop.long);
    if (pt) out.push({ lat: pt[0], lng: pt[1] });
  }
  return out;
}

function dist(a, b) {
  return Math.hypot((a[0] - b[0]) * 111000, (a[1] - b[1]) * 102000);
}

function downsample(pts, max = 1400) {
  if (!pts || pts.length <= max) return pts || [];
  const step = Math.ceil(pts.length / max);
  const out = [];
  for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
  const last = pts[pts.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function dedupe(pts) {
  const out = [];
  for (const pt of pts || []) {
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) out.push(pt);
  }
  return out;
}

function maybeReverse(path, stops) {
  if (!path?.length || stops.length < 2) return path;
  const first = [stops[0].lat, stops[0].lng];
  const last = [stops[stops.length - 1].lat, stops[stops.length - 1].lng];
  const forward = dist(path[0], first) + dist(path[path.length - 1], last);
  const backward = dist(path[path.length - 1], first) + dist(path[0], last);
  return backward + 80 < forward ? path.slice().reverse() : path;
}

function stitchWays(rel) {
  const ways = [];
  for (const member of rel.members || []) {
    if (member.type !== 'way' || !Array.isArray(member.geometry)) continue;
    const pts = [];
    for (const node of member.geometry) {
      const pt = validPoint(node.lat, node.lon ?? node.lng);
      if (pt) pts.push(pt);
    }
    if (pts.length >= 2) ways.push(pts);
  }
  if (!ways.length) return [];
  const unused = ways.map((w) => w.slice());
  let path = unused.shift();
  while (unused.length) {
    const head = path[0];
    const tail = path[path.length - 1];
    let bestI = -1;
    let bestD = Infinity;
    let bestRev = false;
    let append = true;
    for (let i = 0; i < unused.length; i += 1) {
      const w = unused[i];
      const a = w[0];
      const b = w[w.length - 1];
      const opts = [
        { d: dist(tail, a), rev: false, end: true },
        { d: dist(tail, b), rev: true, end: true },
        { d: dist(head, b), rev: false, end: false },
        { d: dist(head, a), rev: true, end: false }
      ];
      for (const opt of opts) {
        if (opt.d < bestD) {
          bestD = opt.d;
          bestI = i;
          bestRev = opt.rev;
          append = opt.end;
        }
      }
    }
    if (bestI < 0 || bestD > 120) break;
    let w = unused.splice(bestI, 1)[0];
    if (bestRev) w = w.slice().reverse();
    path = append ? path.concat(w.slice(1)) : w.slice(0, -1).concat(path);
  }
  return dedupe(path);
}

function geomFromRelation(rel) {
  return stitchWays(rel);
}

function maxJump(coords) {
  let best = 0;
  for (let i = 1; i < (coords || []).length; i += 1) {
    best = Math.max(best, dist(coords[i - 1], coords[i]));
  }
  return best;
}

function nearestDist(pt, coords) {
  let best = Infinity;
  for (const c of coords || []) best = Math.min(best, dist(pt, c));
  return best;
}

function pathIsSane(coords, stops) {
  if (!coords || coords.length < 2) return false;
  if (maxJump(coords) > 2500) return false;
  if (stops.length < 2) return true;
  const first = nearestDist([stops[0].lat, stops[0].lng], coords);
  const last = nearestDist([stops[stops.length - 1].lat, stops[stops.length - 1].lng], coords);
  if (first > 450 || last > 450) return false;
  const far = stops.filter((s) => nearestDist([s.lat, s.lng], coords) > 350).length;
  return far <= Math.max(2, Math.floor(stops.length * 0.2));
}

function sampleStops(stops, max = 12) {
  if (stops.length <= max) return stops;
  const out = [stops[0]];
  const inner = max - 2;
  for (let i = 1; i <= inner; i += 1) {
    const idx = Math.round((i * (stops.length - 1)) / (inner + 1));
    const pt = stops[idx];
    const prev = out[out.length - 1];
    if (pt && (prev.lat !== pt.lat || prev.lng !== pt.lng)) out.push(pt);
  }
  const last = stops[stops.length - 1];
  const prev = out[out.length - 1];
  if (prev.lat !== last.lat || prev.lng !== last.lng) out.push(last);
  return out;
}

function operatorClause(co) {
  const c = String(co || '').toUpperCase();
  if (c === 'KMB') return '["operator"~"KMB|九巴|Kowloon Motor Bus",i]';
  if (c === 'LWB') return '["operator"~"LWB|龍運|Long Win",i]';
  if (c === 'CTB') return '["operator"~"Citybus|城巴|CTB|NWFB|新巴",i]';
  if (c === 'NLB') return '["operator"~"NLB|嶼巴|New Lantao",i]';
  return '';
}

function routeTypeClause(co) {
  return String(co || '').toUpperCase() === 'GMB'
    ? '["route"="minibus"]'
    : '["route"~"^(bus|minibus)$"]';
}

function bboxAround(stops) {
  if (!stops.length) return '';
  const lats = stops.map((s) => s.lat);
  const lngs = stops.map((s) => s.lng);
  const pad = 0.06;
  return `(${Math.min(...lats) - pad},${Math.min(...lngs) - pad},${Math.max(...lats) + pad},${Math.max(...lngs) + pad})`;
}

function buildQuery(route, co, withOperator, stops) {
  const op = withOperator ? operatorClause(co) : '';
  const area = bboxAround(stops) || '(area["ISO3166-1"="HK"])';
  return `[out:json][timeout:8];
(
  relation["type"="route"]${routeTypeClause(co)}["ref"="${escapeQl(route)}"]${op}${area};
);
out geom;`;
}

function scoreRelation(rel, orig, dest, stops) {
  const tags = rel.tags || {};
  const from = fold(tags.from);
  const to = fold(tags.to);
  const name = fold(tags.name);
  const blob = `${from} ${to} ${name}`;
  const o = fold(orig);
  const d = fold(dest);
  const coords = geomFromRelation(rel);
  let score = Math.min(4, Math.floor(coords.length / 200));
  if (from && to) score += 3;
  if (d && (to.includes(d) || blob.includes(d))) score += 8;
  if (o && (from.includes(o) || blob.includes(o))) score += 8;
  if (d && to && d.slice(0, 2) && to.includes(d.slice(0, 2))) score += 2;
  if (o && from && o.slice(0, 2) && from.includes(o.slice(0, 2))) score += 2;
  if (coords.length >= 8 && stops.length >= 2) {
    const first = [stops[0].lat, stops[0].lng];
    const last = [stops[stops.length - 1].lat, stops[stops.length - 1].lng];
    const bestEnd = Math.min(
      dist(coords[0], first) + dist(coords[coords.length - 1], last),
      dist(coords[coords.length - 1], first) + dist(coords[0], last)
    );
    score += Math.max(0, 12 - bestEnd / 250);
  }
  return score;
}

async function overpassQuery(ql) {
  let lastError;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: new URLSearchParams({ data: ql }),
        signal: AbortSignal.timeout(url === OVERPASS_URLS[0] ? 6000 : 5000)
      });
      if (!res.ok) {
        lastError = new Error(`Overpass HTTP ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Overpass failed');
}

async function osmPath(route, co, orig, dest, stops) {
  const ref = String(route || '').trim();
  if (!ref) return null;
  const json = await overpassQuery(buildQuery(ref, co, Boolean(operatorClause(co)), stops));
  const rels = (json.elements || []).filter((row) => row.type === 'relation');
  if (!rels.length) return null;
  rels.sort((a, b) => scoreRelation(b, orig, dest, stops) - scoreRelation(a, orig, dest, stops));
  const picked = rels[0];
  const coords = downsample(geomFromRelation(picked));
  if (!pathIsSane(coords, stops)) return null;
  const tags = picked.tags || {};
  return {
    coords,
    source: 'osm',
    name: tags.name || '',
    from: tags.from || '',
    to: tags.to || ''
  };
}

async function osrmChunk(stops) {
  const loc = stops.map((p) => `${p.lng},${p.lat}`).join(';');
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${loc}?geometries=geojson&overview=full`,
    { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.[0]?.geometry?.coordinates) return [];
  return json.routes[0].geometry.coordinates
    .map(([lng, lat]) => validPoint(lat, lng))
    .filter(Boolean);
}

async function osrmPath(stops) {
  const sampled = sampleStops(stops, 12);
  if (sampled.length < 2) return null;
  const coords = [];
  for (let i = 0; i < sampled.length - 1; i += 19) {
    const chunk = sampled.slice(i, Math.min(i + 20, sampled.length));
    const part = await osrmChunk(chunk);
    if (part.length < 2) return null;
    if (coords.length) part.shift();
    coords.push(...part);
  }
  const out = downsample(dedupe(coords));
  if (!pathIsSane(out, stops) && !pathIsSane(out, sampled)) return null;
  return out.length >= 2 ? { coords: out, source: 'osrm', name: '', from: '', to: '' } : null;
}

function straightPath(stops) {
  const coords = stops.map((p) => [p.lat, p.lng]);
  return coords.length >= 2 ? { coords, source: 'straight', name: '', from: '', to: '' } : { coords: [], source: 'straight', name: '', from: '', to: '' };
}

export async function resolveRouteLine({ route, co, bound, orig, dest, stops } = {}) {
  const company = String(co || 'KMB').toUpperCase();
  const color = lineColorForCo(company);
  const pts = stopPoints(stops);
  const key = ['line', 'v3', company, String(route || '').trim().toUpperCase(), bound || '', fold(orig), fold(dest), pts.length].join('|');
  const hit = cache.get(key);
  if (hit) return { ...hit, color };

  let mapped = null;
  if (pts.length >= 2) {
    try {
      mapped = await osrmPath(pts);
    } catch {
      mapped = null;
    }
  }
  if (!mapped?.coords?.length) {
    try {
      mapped = await osmPath(route, company, orig, dest, pts);
    } catch {
      mapped = null;
    }
    if (mapped?.coords?.length) {
      mapped = { ...mapped, coords: maybeReverse(mapped.coords, pts) };
      if (!pathIsSane(mapped.coords, pts)) mapped = null;
    }
  }
  if (!mapped?.coords?.length) mapped = straightPath(pts);

  const payload = {
    coords: mapped.coords,
    source: mapped.source,
    name: mapped.name || '',
    from: mapped.from || '',
    to: mapped.to || '',
    color,
    route: String(route || ''),
    co: company
  };
  cache.set(key, payload, payload.source === 'osm' ? TTL_MS : 10 * 60 * 1000);
  return payload;
}
