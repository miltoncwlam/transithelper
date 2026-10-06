/** Opening the app does not replay a searched route. The only saved trips are
 * 我的回家路線 (tb-homes). Language and clock/countdown stay as display settings.
 */

import { itineraryKey } from './journeyGroups.js';
import { etaMs } from './tripLock.js';

export const VIEW_KEY = 'tb-view';
export const JOURNEY_KEY = 'tb-journey';

/** Route lookups. Cleared on open. Homes, language, and the device id are not in this list. */
export const ROUTE_MEMORY_KEYS = ['tb-view', 'tb-journey', 'tb-arrival', 'tb-mtr', 'tb-planner-mode', 'tb-recents'];

export function forgetRouteMemory() {
  if (typeof window === 'undefined') return;
  for (const key of ROUTE_MEMORY_KEYS) {
    try { localStorage.removeItem(key); } catch {}
  }
}

/** A locked bus whose clock passed more than this ago has left; do not relock. */
export const RELOCK_GRACE_MS = 2 * 60 * 1000;

/** Fresh options within this window of the locked clock count as the same bus. */
export const RELOCK_WINDOW_MS = 10 * 60 * 1000;

function read(key) {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function readSessionView() {
  const raw = read(VIEW_KEY);
  return { view: raw.view || null, at: Number(raw.at) || 0 };
}

export function writeSessionView() {}

export function readJourneySession() {
  const raw = read(JOURNEY_KEY);
  return raw && raw.version === 1 ? raw : {};
}

export function writeJourneySession() {}

export function clearJourneySession() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(JOURNEY_KEY); } catch {}
}

export function hasRestorableJourney(journey) {
  return !!(journey?.origin?.stops?.length && journey?.destination?.stops?.length);
}

/** A fresh page load always opens arrivals with the nearby board. */
export function pickBootView() {
  return 'nearby';
}

/** Relock only while the locked clock is still (almost) in the future. */
export function shouldRelock(locked, now = Date.now()) {
  const ms = etaMs(locked?.eta);
  return Number.isFinite(ms) && ms > now - RELOCK_GRACE_MS;
}

function sameService(a, b) {
  if (!a || !b) return false;
  return String(a.co || 'KMB').toUpperCase() === String(b.co || 'KMB').toUpperCase()
    && String(a.route || '').toUpperCase() === String(b.route || '').toUpperCase();
}

/**
 * Find the fresh planner option that is the same trip as the saved lock:
 * same itinerary first, then the live clock closest to the locked one.
 * Falls back to matching routes when nearby pole expansion shifted the key.
 */
export function findRelockOption(options, locked, windowMs = RELOCK_WINDOW_MS) {
  const target = etaMs(locked?.eta);
  if (!Number.isFinite(target) || !locked?.first) return null;
  const closest = (list) => {
    let best = null;
    let bestDiff = Infinity;
    for (const opt of list) {
      const ms = etaMs(opt?.eta);
      if (!Number.isFinite(ms)) continue;
      const diff = Math.abs(ms - target);
      if (diff < windowMs && diff < bestDiff) {
        best = opt;
        bestDiff = diff;
      }
    }
    return best;
  };
  const all = (options || []).filter((opt) => opt?.first);
  const byKey = all.filter((opt) => locked.key && itineraryKey(opt) === locked.key);
  const hit = closest(byKey);
  if (hit) return hit;
  const loose = all.filter((opt) => (
    opt.kind === locked.kind
    && sameService(opt.first, locked.first)
    && (locked.second ? sameService(opt.second, locked.second) : !opt.second)
  ));
  return closest(loose);
}
