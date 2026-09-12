import test from 'node:test';
import assert from 'node:assert/strict';
import { canCatchUp, pickLockedTrip, sameClock } from '../lib/tripLock.js';

test('catch-up is allowed for any live clock, not only 3 minutes', () => {
  const in7 = new Date(Date.now() + 7 * 60000).toISOString();
  const in15 = new Date(Date.now() + 15 * 60000).toISOString();
  assert.equal(canCatchUp(in7), true);
  assert.equal(canCatchUp(in15), true);
  assert.equal(canCatchUp(null), false);
  assert.equal(canCatchUp('', false), false);
  assert.equal(canCatchUp(null, true), true);
});

test('locked trip follows a ticking clock and does not take the next bus', () => {
  const locked = new Date(Date.now() + 7 * 60000).toISOString();
  const ticked = new Date(Date.now() + 6 * 60000).toISOString();
  const next = new Date(Date.now() + 15 * 60000).toISOString();
  assert.equal(pickLockedTrip([{ board: locked }, { board: next }], locked).board, locked);
  assert.equal(sameClock(locked, next), false);
  assert.equal(sameClock(locked, ticked), true);
  assert.equal(pickLockedTrip([{ board: ticked }, { board: next }], locked).board, ticked);
  assert.equal(pickLockedTrip([{ board: next }], locked), null);
});
