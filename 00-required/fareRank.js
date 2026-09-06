/**
 * Rank trips by door-to-door (or arrival) time plus Octopus fare, using Hong
 * Kong statutory minimum wage as the value of time — not a made-up $/min.
 *
 * SMW from 1 May 2026: $43.1 / hour (Cap. 608 Sch. 3) ≈ $0.72 / minute.
 * Missing fare → time-only. Do not invent HKD.
 */

export const HK_SMW_HKD_PER_HOUR = 43.1;
export const HK_SMW_HKD_PER_MINUTE = HK_SMW_HKD_PER_HOUR / 60;

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
