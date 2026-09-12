/** Lock this live clock; catch-up is not limited to a 3-minute wait. */

const SAME_CLOCK_MS = 2 * 60 * 1000;

export function etaMs(value) {
  if (value == null || value === '') return NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

export function canCatchUp(eta, leftBoard = false) {
  if (leftBoard) return true;
  return Number.isFinite(etaMs(eta));
}

export function sameClock(a, b, windowMs = SAME_CLOCK_MS) {
  const am = etaMs(a);
  const bm = etaMs(b);
  return Number.isFinite(am) && Number.isFinite(bm) && Math.abs(am - bm) < windowMs;
}

export function tripBoard(trip) {
  if (trip == null) return null;
  if (typeof trip === 'string' || typeof trip === 'number') return trip;
  return trip.board || trip.eta || null;
}

export function pickLockedTrip(trips, lockedEta, windowMs = SAME_CLOCK_MS) {
  if (!lockedEta) return null;
  const lockedMs = etaMs(lockedEta);
  if (!Number.isFinite(lockedMs)) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const row of trips || []) {
    const ms = etaMs(tripBoard(row));
    if (!Number.isFinite(ms)) continue;
    const diff = Math.abs(ms - lockedMs);
    if (diff < windowMs && diff < bestDiff) {
      best = row;
      bestDiff = diff;
    }
  }
  return best;
}
