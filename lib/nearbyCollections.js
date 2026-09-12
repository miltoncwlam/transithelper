/** Home / Work nearby collections: one live board per kind, not a typed-route bookmark. */

export function nearbyKindOf(item) {
  if (item?.type !== 'nearby') return null;
  return String(item.payload?.kind || '').toLowerCase() === 'work' ? 'work' : 'home';
}

export function nearbyCollectionTitle(kind) {
  return kind === 'work'
    ? { zh: '返工附近', en: 'Work nearby' }
    : { zh: '回家附近', en: 'Home nearby' };
}

export function replaceNearbyKind(rows, kind, next) {
  const keep = (rows || []).filter((row) => !(row.type === 'nearby' && nearbyKindOf(row) === kind));
  return next ? [next, ...keep] : keep;
}

function newestFirst(rows) {
  return [...(rows || [])].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)
    || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

/** Keep at most one home nearby and one work nearby; newest / pinned wins. */
export function collapseNearbyKinds(rows) {
  const seen = new Set();
  const out = [];
  for (const row of newestFirst(rows)) {
    const kind = nearbyKindOf(row);
    if (kind) {
      if (seen.has(kind)) continue;
      seen.add(kind);
    }
    out.push(row);
  }
  return out;
}

export function splitHomes(rows) {
  const collections = [];
  const routes = [];
  for (const row of collapseNearbyKinds(rows)) {
    if (row.type === 'nearby') collections.push(row);
    else routes.push(row);
  }
  const order = { home: 0, work: 1 };
  collections.sort((a, b) => (order[nearbyKindOf(a)] ?? 9) - (order[nearbyKindOf(b)] ?? 9)
    || Number(!!b.pinned) - Number(!!a.pinned));
  return { collections, routes };
}
