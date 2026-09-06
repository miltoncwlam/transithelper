/** Merge similar journey planner rows into one itinerary group. */

function coOf(service) {
  return String(service?.co || 'KMB').toUpperCase();
}

function routeOf(service) {
  return String(service?.route || '').toUpperCase();
}

export function itineraryKey(option) {
  return [
    option?.kind || '',
    coOf(option?.first),
    routeOf(option?.first),
    option?.first?.gmb_route_id || '',
    option?.second ? coOf(option.second) : '',
    option?.second ? routeOf(option.second) : '',
    option?.second?.gmb_route_id || '',
    option?.boardStops?.[0] || option?.fromStop || ''
  ].join('|');
}

export function keepSilentJourneyList(emptyReason) {
  return emptyReason === 'timeout';
}

function arriveMs(option) {
  const value = new Date(option?.arrive || option?.eta || 0).getTime();
  return Number.isFinite(value) ? value : Infinity;
}

function uniqueEtas(members) {
  const seen = new Set();
  const out = [];
  for (const row of members || []) {
    if (!row?.eta || seen.has(row.eta)) continue;
    seen.add(row.eta);
    out.push(row.eta);
  }
  return out.sort((a, b) => new Date(a) - new Date(b));
}

export function mergeJourneyGroups(options) {
  const buckets = new Map();
  const order = new Map();
  (options || []).forEach((option, i) => {
    if (!option?.first?.route) return;
    const key = itineraryKey(option);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(option);
    if (!order.has(key)) order.set(key, i);
  });
  const groups = [];
  for (const members of buckets.values()) {
    const sorted = [...members].sort((a, b) => arriveMs(a) - arriveMs(b) || new Date(a.eta || 0) - new Date(b.eta || 0));
    const best = sorted[0];
    const etas = uniqueEtas(sorted);
    groups.push({
      key: itineraryKey(best),
      kind: best.kind,
      best,
      members: sorted,
      laterEtas: etas.filter((eta) => eta !== best.eta).slice(0, 2),
      preferred: sorted.some((row) => row.preferred)
    });
  }
  groups.sort((a, b) => {
    const catchA = a.best.catchable !== false;
    const catchB = b.best.catchable !== false;
    if (catchA !== catchB) return catchA ? -1 : 1;
    const oa = order.get(a.key) ?? 9999;
    const ob = order.get(b.key) ?? 9999;
    if (oa !== ob) return oa - ob;
    const at = arriveMs(a.best) - arriveMs(b.best);
    if (at) return at;
    return Number(a.kind === 'transfer') - Number(b.kind === 'transfer');
  });
  const timeBest = groups.reduce((best, group) => {
    if (group.best.catchable === false) return best;
    if (!best || arriveMs(group.best) < arriveMs(best.best)) return group;
    return best;
  }, null) || groups[0];
  return groups.map((group, i) => {
    const slower = timeBest?.best?.arrive && group.best.arrive
      ? Math.max(0, Math.round((new Date(group.best.arrive) - new Date(timeBest.best.arrive)) / 60000))
      : 0;
    return {
      ...group,
      recommended: i === 0,
      slowerByMinutes: slower || null,
      cheaperByHkd: group.best.cheaperByHkd ?? null,
      cheaperBetter: i === 0 && !!group.best.cheaperBetter
    };
  });
}

export function stopPlaceLabel(pair) {
  const raw = pair?.zh || pair?.en || pair || '';
  return String(raw).normalize('NFKC').replace(/\s*\([^)]*\)\s*/g, '').trim();
}

export function samePlaceLabel(a, b) {
  const left = stopPlaceLabel(a).replace(/[\s–—_.,'"-]+/g, '');
  const right = stopPlaceLabel(b).replace(/[\s–—_.,'"-]+/g, '');
  return !!(left && right && left === right);
}
