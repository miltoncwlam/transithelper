import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HK_SMW_HKD_PER_HOUR,
  HK_SMW_HKD_PER_MINUTE,
  compareByWageTime,
  generalizedMinutes,
  octopusHkd,
  sortByWageTime,
  timeMinutesOfArrive
} from '../00-required/fareRank.js';

const t0 = Date.parse('2026-09-05T12:00:00+08:00');

function trip(arriveMin, fare, extra = {}) {
  return {
    catchable: true,
    kind: extra.kind || 'direct',
    walkMinutes: extra.walkMinutes || 0,
    arrive: new Date(t0 + arriveMin * 60000).toISOString(),
    octopus_fare_hkd: fare,
    ...extra
  };
}

test('SMW is $43.1/hour, far below $2 per minute', () => {
  assert.equal(HK_SMW_HKD_PER_HOUR, 43.1);
  assert.ok(Math.abs(HK_SMW_HKD_PER_MINUTE - 43.1 / 60) < 1e-9);
  assert.ok(HK_SMW_HKD_PER_MINUTE < 1);
  assert.ok(HK_SMW_HKD_PER_MINUTE < 2);
});

test('2 min slower and $2 cheaper wins at min wage, would lose at $2/min', () => {
  const fast = trip(20, 12);
  const cheap = trip(22, 10);
  const ranked = sortByWageTime([fast, cheap], (row) => timeMinutesOfArrive(row, t0));
  assert.equal(octopusHkd(ranked[0]), 10);
  const atTwoDollars = generalizedMinutes(20, 12) - (12 / HK_SMW_HKD_PER_MINUTE) + 12 / 2;
  const cheapAtTwo = generalizedMinutes(22, 10) - (10 / HK_SMW_HKD_PER_MINUTE) + 10 / 2;
  assert.ok(atTwoDollars < cheapAtTwo);
  assert.ok(generalizedMinutes(22, 10) < generalizedMinutes(20, 12));
});

test('2 min slower and $5 cheaper wins', () => {
  const ranked = sortByWageTime([trip(20, 12), trip(22, 7)], (row) => timeMinutesOfArrive(row, t0));
  assert.equal(ranked[0].octopus_fare_hkd, 7);
});

test('15 min slower and $5 cheaper still loses', () => {
  const ranked = sortByWageTime([trip(20, 12), trip(35, 7)], (row) => timeMinutesOfArrive(row, t0));
  assert.equal(ranked[0].octopus_fare_hkd, 12);
});

test('missing fare ranks by time only', () => {
  const ranked = sortByWageTime([trip(22, 7), trip(20, null)], (row) => timeMinutesOfArrive(row, t0));
  assert.equal(ranked[0].arrive, trip(20, null).arrive);
  assert.ok(compareByWageTime(trip(20, null), trip(22, 7), (row) => timeMinutesOfArrive(row, t0)) < 0);
});
