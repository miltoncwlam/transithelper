import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRestorableArrival } from '../lib/arrivalPref.js';

test('a last bus with a stop restores instead of auto nearby', () => {
  assert.equal(hasRestorableArrival({
    route: '1',
    service: { route: '1', co: 'KMB' },
    stopIndex: 0
  }), true);
  assert.equal(hasRestorableArrival({
    service: { route: '1' },
    stopIndex: '3'
  }), true);
});

test('missing or incomplete last bus does not restore', () => {
  assert.equal(hasRestorableArrival({}), false);
  assert.equal(hasRestorableArrival({ service: { route: '1' } }), false);
  assert.equal(hasRestorableArrival({ service: { route: '1' }, stopIndex: '' }), false);
  assert.equal(hasRestorableArrival({ service: { route: '1' }, stopIndex: null }), false);
  assert.equal(hasRestorableArrival(null), false);
});
