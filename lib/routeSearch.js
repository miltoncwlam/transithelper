export function n(x) {
  return String(x || '').trim().toUpperCase();
}

export function parseRouteToken(s) {
  const raw = n(s);
  const m = /^([A-Z]*)(\d+)([A-Z]*)$/.exec(raw);
  if (m) return { raw, prefix: m[1], num: m[2], suffix: m[3] };
  return { raw, prefix: raw.replace(/[^A-Z]/g, ''), num: raw.replace(/\D/g, ''), suffix: '' };
}

export function routeMatchRank(query, route) {
  const q = parseRouteToken(query);
  const r = parseRouteToken(route);
  if (!q.raw || !r.raw) return 99;
  if (r.raw === q.raw) return 0;
  if (q.num && r.num && q.num === r.num) return 1;
  if (!q.num && q.raw && (r.prefix === q.raw || r.suffix === q.raw)) return 1;
  if (q.num && r.num && r.num.startsWith(q.num) && r.raw.startsWith(q.raw)) return 2;
  if (q.num && r.raw.startsWith(q.num)) return 2;
  if (q.num && (r.num.includes(q.num) || r.raw.includes(q.num))) return 3;
  if (q.raw.length >= 1 && r.raw.includes(q.raw)) return 4;
  return 99;
}

export function compareRouteMatches(query, aRoute, bRoute) {
  const ar = routeMatchRank(query, aRoute);
  const br = routeMatchRank(query, bRoute);
  if (ar !== br) return ar - br;
  const a = n(aRoute);
  const b = n(bRoute);
  return a.length - b.length || a.localeCompare(b);
}

function serviceKey(row) {
  return [
    String(row.co || 'KMB').toUpperCase(),
    n(row.route),
    row.bound,
    row.service_type,
    row.gmb_route_id || '',
    row.nlb_route_id || '',
    row.orig_en,
    row.dest_en
  ].join('|');
}

export function collectMatchingServices(routes, query, variantCap = 24) {
  const q = n(query);
  if (!q) return [];
  const byRoute = new Map();
  for (const x of routes || []) {
    const rank = routeMatchRank(q, x.route);
    if (rank >= 99) continue;
    const route = n(x.route);
    const cur = byRoute.get(route);
    if (!cur || rank < cur.rank) byRoute.set(route, { rank, route });
  }
  const names = [...byRoute.values()].sort((a, b) => a.rank - b.rank || a.route.length - b.route.length || a.route.localeCompare(b.route));
  const seen = new Set();
  const exact = [];
  const rest = [];
  for (const { route, rank } of names) {
    const bucket = rank === 0 ? exact : rest;
    for (const x of routes || []) {
      if (n(x.route) !== route) continue;
      if (String(x.co || '').toUpperCase() === 'GMB' && !x.gmb_route_id) continue;
      const key = serviceKey(x);
      if (seen.has(key)) continue;
      seen.add(key);
      bucket.push(x);
    }
  }
  return exact.concat(rest.slice(0, variantCap));
}

export function sortLiveChoices(query, keep) {
  return [...(keep || [])].sort((a, b) => {
    const ra = a.service || a.x || a;
    const rb = b.service || b.x || b;
    return compareRouteMatches(query, ra.route, rb.route);
  });
}
