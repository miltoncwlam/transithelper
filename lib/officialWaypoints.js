import { fareForRoute } from './fares.js';

const UA = 'TransitBuddy/1.0 (https://hktransit.vercel.app)';
const FILES = [
  (id, dir) => `https://hkbus.github.io/route-waypoints/${id}-${dir}.json`,
  (id, dir) => `https://cdn.jsdelivr.net/gh/hkbus/route-waypoints@gh-pages/${id}-${dir}.json`,
  (id, dir) => `https://waypoints.hkbuseta.com/waypoints/${id}-${dir}.json`
];

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

function dist(a, b) {
  return Math.hypot((a[0] - b[0]) * 111000, (a[1] - b[1]) * 102000);
}

function flattenGeom(geom) {
  if (!geom) return [];
  const lines = geom.type === 'LineString'
    ? [geom.coordinates]
    : (geom.type === 'MultiLineString' ? geom.coordinates : []);
  const out = [];
  for (const line of lines || []) {
    const pts = (line || []).map(([lng, lat]) => validPoint(lat, lng)).filter(Boolean);
    if (pts.length < 2) continue;
    if (!out.length) {
      out.push(...pts);
      continue;
    }
    const tail = out[out.length - 1];
    const fwd = dist(tail, pts[0]);
    const back = dist(tail, pts[pts.length - 1]);
    const use = back + 8 < fwd ? pts.slice().reverse() : pts;
    if (dist(tail, use[0]) < 8) out.push(...use.slice(1));
    else out.push(...use);
  }
  return out;
}

function placeHit(a, b) {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a) || a.includes(b.slice(0, 4)) || b.includes(a.slice(0, 4));
}

function scoreFeature(props, co, orig, dest) {
  const company = String(co || '').toUpperCase();
  const code = fold(props?.COMPANY_CODE);
  let score = 0;
  if (code && (code === company || (company === 'LWB' && code === 'KMB') || (company === 'KMB' && code === 'LWB'))) score += 4;
  if (company === 'CTB' && (code === 'CTB' || code === 'NWFB' || code === 'CTBNWFB')) score += 4;
  if (company === 'NLB' && code === 'NLB') score += 4;
  if (company === 'GMB' && (code === 'GMB' || code === 'GMBKMB' || code.includes('GMB'))) score += 4;
  const from = fold(props?.ST_STOP_NAMEC || props?.ST_STOP_NAMEE);
  const to = fold(props?.ED_STOP_NAMEC || props?.ED_STOP_NAMEE);
  const o = fold(orig);
  const d = fold(dest);
  if (placeHit(to, d)) score += 10;
  if (placeHit(from, o)) score += 10;
  if (placeHit(from, d)) score -= 6;
  if (placeHit(to, o)) score -= 6;
  return score;
}

function scoreWithCoords(props, co, orig, dest, stops, coords) {
  let score = scoreFeature(props, co, orig, dest);
  if (coords.length >= 8 && stops?.length >= 2) {
    const first = [stops[0].lat, stops[0].lng];
    const last = [stops[stops.length - 1].lat, stops[stops.length - 1].lng];
    const forward = dist(coords[0], first) + dist(coords[coords.length - 1], last);
    const backward = dist(coords[coords.length - 1], first) + dist(coords[0], last);
    score += Math.max(0, 16 - Math.min(forward, backward) / 180);
    if (backward + 120 < forward) score -= 4;
  }
  return score;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
    signal: AbortSignal.timeout(4000)
  });
  if (!res.ok) throw new Error(`waypoints HTTP ${res.status}`);
  return res.json();
}

async function loadWaypoint(id, dir) {
  const urls = FILES.map((make) => make(id, dir));
  return Promise.any(urls.map((url) => fetchJson(url)));
}

function featuresOf(json) {
  if (!json) return [];
  if (Array.isArray(json.features)) return json.features;
  if (json.geometry) return [json];
  return [];
}

export async function officialRoutePath({ route, co, bound, orig, dest, stops, td_route_id } = {}) {
  let id = td_route_id || null;
  let meta = null;
  if (!id) {
    meta = await fareForRoute({
      route,
      co,
      bound,
      orig_tc: orig,
      orig_en: orig,
      dest_tc: dest,
      dest_en: dest
    }).catch(() => null);
    id = meta?.route_id;
  }
  if (!id) return null;
  const preferred = meta?.bound === 'I' || bound === 'I' || Number(meta?.route_seq) === 2 ? 'I' : 'O';
  const dirs = [preferred, preferred === 'O' ? 'I' : 'O'];
  const packs = await Promise.all(dirs.map(async (dir) => {
    try {
      return { dir, json: await loadWaypoint(id, dir) };
    } catch {
      return { dir, json: null };
    }
  }));
  let best = null;
  let bestScore = -99;
  for (const pack of packs) {
    for (const feat of featuresOf(pack.json)) {
      const coords = flattenGeom(feat.geometry);
      if (coords.length < 8) continue;
      const score = scoreWithCoords(feat.properties || {}, co, orig, dest, stops, coords);
      if (score > bestScore) {
        bestScore = score;
        best = {
          coords,
          source: 'official',
          name: feat.properties?.ROUTE_NAMEC || feat.properties?.ROUTE_NAMEE || String(route || ''),
          from: feat.properties?.ST_STOP_NAMEC || feat.properties?.ST_STOP_NAMEE || '',
          to: feat.properties?.ED_STOP_NAMEC || feat.properties?.ED_STOP_NAMEE || ''
        };
      }
    }
  }
  return best;
}
