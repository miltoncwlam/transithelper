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

function geomFromRelation(rel) {
  const pts = [];
  for (const member of rel.members || []) {
    if (member.type !== 'way' || !Array.isArray(member.geometry)) continue;
    for (const node of member.geometry) {
      const pt = validPoint(node.lat, node.lon ?? node.lng);
      if (pt) pts.push(pt);
    }
  }
  return dedupe(pts);
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

function buildQuery(route, co, withOperator) {
  const op = withOperator ? operatorClause(co) : '';
  return `[out:json][timeout:20];
area["ISO3166-1"="HK"]->.hk;
(
  relation["type"="route"]${routeTypeClause(co)}["ref"="${escapeQl(route)}"]${op}(area.hk);
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
        signal: AbortSignal.timeout(url === OVERPASS_URLS[0] ? 10000 : 8000)
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
  const json = await overpassQuery(buildQuery(ref, co, Boolean(operatorClause(co))));
  const rels = (json.elements || []).filter((row) => row.type === 'relation');
  if (!rels.length) return null;
  rels.sort((a, b) => scoreRelation(b, orig, dest, stops) - scoreRelation(a, orig, dest, stops));
  const picked = rels[0];
  const coords = downsample(geomFromRelation(picked));
  if (coords.length < 8) return null;
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
    { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(12000) }
  );
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.[0]?.geometry?.coordinates) return [];
  return json.routes[0].geometry.coordinates
    .map(([lng, lat]) => validPoint(lat, lng))
    .filter(Boolean);
}

async function osrmPath(stops) {
  if (stops.length < 2) return null;
  const chunks = [];
  for (let i = 0; i < stops.length - 1; i += 19) {
    chunks.push(stops.slice(i, Math.min(i + 20, stops.length)));
  }
  const coords = [];
  for (const chunk of chunks) {
    const part = await osrmChunk(chunk);
    if (part.length < 2) return null;
    if (coords.length) part.shift();
    coords.push(...part);
  }
  const out = downsample(dedupe(coords));
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
  const key = ['line', 'v2', company, String(route || '').trim().toUpperCase(), bound || '', fold(orig), fold(dest), pts.length].join('|');
  const hit = cache.get(key);
  if (hit) return { ...hit, color };

  let mapped = null;
  try {
    mapped = await osmPath(route, company, orig, dest, pts);
  } catch {
    mapped = null;
  }
  if (mapped?.coords?.length) {
    mapped = { ...mapped, coords: maybeReverse(mapped.coords, pts) };
  } else if (pts.length >= 2) {
    try {
      mapped = await osrmPath(pts);
    } catch {
      mapped = null;
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
