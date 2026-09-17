/**
 * Planner ranks by street cost, not raw arrive or 較抵 labels.
 * Four factors: travel time, transfer (hassle + wait already in the clock),
 * walking (heavier than sitting), fare at SMW. Missing fare → omit HKD.
 *
 * SMW from 1 May 2026: $43.1 / hour (Cap. 608 Sch. 3).
 */

export const HK_SMW_HKD_PER_HOUR = 43.1;
export const HK_SMW_HKD_PER_MINUTE = HK_SMW_HKD_PER_HOUR / 60;

/** Changing buses is worse than staying on one that arrives a minute later. */
export const TRANSFER_PENALTY_MINUTES = 4;

/** Walking counts double vs sitting on the bus. */
export const WALK_WEIGHT = 2;

export function octopusHkd(option) {
  const n = option?.octopus_fare_hkd ?? option?.section_fare_hkd ?? option?.full_fare_hkd;
  if (n == null || n === '') return null;
  const value = Number(n);
  return Number.isFinite(value) ? value : null;
}

export function generalizedMinutes(timeMinutes, fareHkd) {
  const time = Number(timeMinutes);
  if (!Number.isFinite(time)) return Infinity;
  if (fareHkd == null || !Number.isFinite(Number(fareHkd))) return time;
  return time + Number(fareHkd) / HK_SMW_HKD_PER_MINUTE;
}

export function timeMinutesOfArrive(option, epochMs = 0) {
  const ms = new Date(option?.arrive || option?.eta || 0).getTime();
  if (!Number.isFinite(ms)) return Infinity;
  return (ms - epochMs) / 60000;
}

export function optionWalkMinutes(option) {
  const board = Number(option?.boardWalkMinutes) || 0;
  const dest = Number(option?.destWalkMinutes) || 0;
  const xfer = option?.kind === 'transfer' ? (Number(option?.walkMinutes) || 0) : 0;
  if (board || dest || xfer) return board + dest + xfer;
  if (option?.kind === 'transfer') return 0;
  return Number(option?.walkMinutes) || 0;
}

export function streetCostMinutes(option, travelMinutes, opts = {}) {
  const travel = Number(travelMinutes);
  if (!Number.isFinite(travel)) return Infinity;
  const board = Number(option?.boardWalkMinutes) || 0;
  const dest = Number(option?.destWalkMinutes) || 0;
  const doorWalk = board + dest;
  const allWalk = optionWalkMinutes(option);
  const door = opts.travelIncludesDoorWalk ? travel : travel + doorWalk;
  const transfers = option?.kind === 'transfer' ? 1 : 0;
  const fare = octopusHkd(option);
  const fareMin = fare != null ? fare / HK_SMW_HKD_PER_MINUTE : 0;
  return door + TRANSFER_PENALTY_MINUTES * transfers + (WALK_WEIGHT - 1) * allWalk + fareMin;
}

export function compareByWageTime(a, b, timeMinutesOf) {
  if (!!a.catchable !== !!b.catchable) return a.catchable !== false ? -1 : 1;
  const ta = timeMinutesOf(a);
  const tb = timeMinutesOf(b);
  const fa = octopusHkd(a);
  const fb = octopusHkd(b);
  if (fa != null && fb != null) {
    const d = generalizedMinutes(ta, fa) - generalizedMinutes(tb, fb);
    if (d) return d;
  } else {
    const d = ta - tb;
    if (d) return d;
  }
  const transfers = Number(a.kind === 'transfer') - Number(b.kind === 'transfer');
  if (transfers) return transfers;
  return (a.walkMinutes || 0) - (b.walkMinutes || 0);
}

export function sortByWageTime(options, timeMinutesOf) {
  return [...(options || [])].sort((a, b) => compareByWageTime(a, b, timeMinutesOf));
}

export function compareByArrive(a, b, timeMinutesOf) {
  if (!!a.catchable !== !!b.catchable) return a.catchable !== false ? -1 : 1;
  const d = timeMinutesOf(a) - timeMinutesOf(b);
  if (d) return d;
  const transfers = Number(a.kind === 'transfer') - Number(b.kind === 'transfer');
  if (transfers) return transfers;
  return optionWalkMinutes(a) - optionWalkMinutes(b);
}

export function sortByArrive(options, timeMinutesOf) {
  return [...(options || [])].sort((a, b) => compareByArrive(a, b, timeMinutesOf));
}

export function compareByStreetCost(a, b, timeMinutesOf, opts = {}) {
  if (!!a.catchable !== !!b.catchable) return a.catchable !== false ? -1 : 1;
  const d = streetCostMinutes(a, timeMinutesOf(a), opts) - streetCostMinutes(b, timeMinutesOf(b), opts);
  if (d) return d;
  const transfers = Number(a.kind === 'transfer') - Number(b.kind === 'transfer');
  if (transfers) return transfers;
  const walk = optionWalkMinutes(a) - optionWalkMinutes(b);
  if (walk) return walk;
  const fa = octopusHkd(a);
  const fb = octopusHkd(b);
  if (fa != null && fb != null && fa !== fb) return fa - fb;
  return timeMinutesOf(a) - timeMinutesOf(b);
}

export function sortByStreetCost(options, timeMinutesOf, opts = {}) {
  return [...(options || [])].sort((a, b) => compareByStreetCost(a, b, timeMinutesOf, opts));
}

export function fareDeltaAgainst(option, baseline) {
  if (!option || !baseline) return { slowerByMinutes: null, cheaperByHkd: null, cheaperBetter: false };
  const slower = Math.round((timeMinutesOfArrive(option) - timeMinutesOfArrive(baseline)) * 10) / 10;
  const slowerByMinutes = Number.isFinite(slower) ? slower : null;
  const a = octopusHkd(option);
  const b = octopusHkd(baseline);
  const cheaperByHkd = a != null && b != null ? Math.round((b - a) * 10) / 10 : null;
  return {
    slowerByMinutes,
    cheaperByHkd,
    cheaperBetter: (slowerByMinutes || 0) > 0 && (cheaperByHkd || 0) > 0
  };
}
