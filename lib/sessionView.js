/** Boot restore: reopen what you were last doing instead of a stale bus route.
 * The planner search lives in React state and dies on a page reload (iOS drops
 * background tabs, pull-to-refresh). We persist the last active view and the
 * planner session so a reload returns to the same search, and an old arrivals
 * route only restores when arrivals really was the last thing you did.
 */

import { itineraryKey } from './journeyGroups.js';
import { etaMs } from './tripLock.js';
import { hasRestorableArrival } from './arrivalPref.js';

export const VIEW_KEY = 'tb-view';
export const JOURNEY_KEY = 'tb-journey';

/** A view/session older than this is not your context any more. */
export const RESTORE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

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

export function writeSessionView(view, now = Date.now()) {
  if (typeof window === 'undefined') return;
  if (view !== 'a' && view !== 't' && view !== 'm') return;
  try { localStorage.setItem(VIEW_KEY, JSON.stringify({ view, at: now })); } catch {}
}

export function readJourneySession() {
  const raw = read(JOURNEY_KEY);
  return raw && raw.version === 1 ? raw : {};
}

/** Merge-write. `locked: null` clears a saved lock; undefined keeps it. */
export function writeJourneySession(next, now = Date.now()) {
  if (typeof window === 'undefined') return;
  try {
    const cur = readJourneySession();
    const merged = {
      version: 1,
      origin: next.origin !== undefined ? next.origin : (cur.origin || null),
      destination: next.destination !== undefined ? next.destination : (cur.destination || null),
      nearby: next.nearby !== undefined ? next.nearby : (cur.nearby !== false),
      radius: next.radius !== undefined ? String(next.radius) : (cur.radius || '250'),
      firstService: next.firstService !== undefined ? next.firstService : (cur.firstService || null),
      interchangeStops: next.interchangeStops !== undefined ? next.interchangeStops : (cur.interchangeStops || null),
      locked: next.locked !== undefined ? next.locked : (cur.locked || null),
      savedAt: now
    };
    localStorage.setItem(JOURNEY_KEY, JSON.stringify(merged));
  } catch {}
}

export function clearJourneySession() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(JOURNEY_KEY); } catch {}
}

export function hasRestorableJourney(journey) {
  return !!(journey?.origin?.stops?.length && journey?.destination?.stops?.length);
}

function fresh(at, now, maxAgeMs) {
  return Number.isFinite(at) && at > 0 && now - at >= 0 && now - at < maxAgeMs;
}

function restorableArrival(arrival, now, maxAgeMs) {
  // Legacy prefs have no savedAt: restore once, the next write timestamps it.
  return hasRestorableArrival(arrival) && (arrival.savedAt == null || fresh(arrival.savedAt, now, maxAgeMs));
}

/**
 * Decide what a fresh page load should show.
 * - The last active view wins when it is fresh.
 * - A legacy install has no view pref: keep the old last-bus restore.
 * - 'nearby' means the arrivals tab with the live nearby board (today's default
 *   when there is nothing to restore).
 */
export function pickBootView({ view, viewAt, journey, arrival, now = Date.now(), maxAgeMs = RESTORE_MAX_AGE_MS }) {
  const viewFresh = fresh(viewAt, now, maxAgeMs);
  if (view === 't' && viewFresh && hasRestorableJourney(journey) && fresh(journey.savedAt, now, maxAgeMs)) {
    return 'journey';
  }
  if (view === 'm' && viewFresh) return 'mtr';
  if (view == null || (view === 'a' && viewFresh)) {
    return restorableArrival(arrival, now, maxAgeMs) ? 'arrival' : 'nearby';
  }
  // Planner/MTR was last but its payload is gone or stale: a fresh last bus is
  // still useful; anything older is not your context any more.
  return restorableArrival(arrival, now, maxAgeMs) && arrival.savedAt != null ? 'arrival' : 'nearby';
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
