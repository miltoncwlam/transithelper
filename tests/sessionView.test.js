import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findRelockOption,
  forgetRouteMemory,
  hasRestorableJourney,
  pickBootView,
  ROUTE_MEMORY_KEYS,
  shouldRelock
} from '../lib/sessionView.js';
import { itineraryKey } from '../lib/journeyGroups.js';

const now = Date.now();

const journey = {
  version: 1,
  origin: { label: 'Fortune City One', stops: [{ co: 'KMB', stop: 'O1' }] },
  destination: { label: 'Prince Edward Station', stops: [{ co: 'KMB', stop: 'D1' }] },
  savedAt: now - 10 * 60 * 1000
};

const arrival = {
  route: '281A',
  service: { route: '281A', co: 'KMB', bound: 'O', service_type: '1' },
  stopIndex: '3',
  destIndex: '',
  savedAt: now - 10 * 60 * 1000
};

test('a stored route never opens on boot', () => {
  assert.equal(pickBootView({ view: 't', viewAt: now, journey, arrival, now }), 'nearby');
  assert.equal(pickBootView({ view: 'a', viewAt: now, journey: {}, arrival, now }), 'nearby');
  assert.equal(pickBootView({ view: 'm', viewAt: now, journey: {}, arrival, now }), 'nearby');
  assert.equal(pickBootView(), 'nearby');
  assert.ok(ROUTE_MEMORY_KEYS.includes('tb-arrival'));
  assert.ok(ROUTE_MEMORY_KEYS.includes('tb-recents'));
  assert.equal(ROUTE_MEMORY_KEYS.includes('tb-homes'), false);
  assert.equal(ROUTE_MEMORY_KEYS.includes('tb-lang'), false);
  assert.equal(typeof forgetRouteMemory, 'function');
});

test('hasRestorableJourney needs both ends with stops', () => {
  assert.equal(hasRestorableJourney(journey), true);
  assert.equal(hasRestorableJourney({}), false);
  assert.equal(hasRestorableJourney({ origin: journey.origin }), false);
  assert.equal(hasRestorableJourney({ origin: journey.origin, destination: { stops: [] } }), false);
});

test('shouldRelock only while the locked clock is still ahead', () => {
  assert.equal(shouldRelock({ eta: new Date(now + 10 * 60000).toISOString() }, now), true);
  assert.equal(shouldRelock({ eta: new Date(now - 60 * 1000).toISOString() }, now), true);
  assert.equal(shouldRelock({ eta: new Date(now - 10 * 60000).toISOString() }, now), false);
  assert.equal(shouldRelock(null, now), false);
  assert.equal(shouldRelock({}, now), false);
});

test('findRelockOption picks the same itinerary with the closest live clock', () => {
  const lockedEta = new Date(now + 20 * 60000).toISOString();
  const target = {
    kind: 'direct',
    first: { route: '281A', co: 'KMB' },
    boardStops: ['S1'],
    eta: new Date(now + 21 * 60000).toISOString()
  };
  const locked = {
    key: itineraryKey({ kind: 'direct', first: { route: '281A', co: 'KMB' }, boardStops: ['S1'] }),
    kind: 'direct',
    eta: lockedEta,
    first: { route: '281A', co: 'KMB' },
    boardStops: ['S1']
  };
  const options = [
    { kind: 'direct', first: { route: '74A', co: 'KMB' }, boardStops: ['S1'], eta: new Date(now + 19 * 60000).toISOString() },
    target,
    { kind: 'direct', first: { route: '281A', co: 'KMB' }, boardStops: ['S1'], eta: new Date(now + 35 * 60000).toISOString() }
  ];
  assert.equal(findRelockOption(options, locked), target);
});

test('findRelockOption falls back to route matching when the pole key shifted', () => {
  const locked = {
    key: itineraryKey({ kind: 'direct', first: { route: '281A', co: 'KMB' }, boardStops: ['OLD'] }),
    kind: 'direct',
    eta: new Date(now + 20 * 60000).toISOString(),
    first: { route: '281A', co: 'KMB' },
    boardStops: ['OLD']
  };
  const target = {
    kind: 'direct',
    first: { route: '281A', co: 'KMB' },
    boardStops: ['NEW'],
    eta: new Date(now + 22 * 60000).toISOString()
  };
  assert.equal(findRelockOption([target], locked), target);
});

test('findRelockOption never locks a different trip or a far-off clock', () => {
  const locked = {
    key: itineraryKey({ kind: 'direct', first: { route: '281A', co: 'KMB' }, boardStops: ['S1'] }),
    kind: 'direct',
    eta: new Date(now + 20 * 60000).toISOString(),
    first: { route: '281A', co: 'KMB' },
    boardStops: ['S1']
  };
  const otherRoute = { kind: 'direct', first: { route: '74A', co: 'KMB' }, boardStops: ['S1'], eta: new Date(now + 20 * 60000).toISOString() };
  assert.equal(findRelockOption([otherRoute], locked), null);
  const tooFar = { kind: 'direct', first: { route: '281A', co: 'KMB' }, boardStops: ['S1'], eta: new Date(now + 60 * 60000).toISOString() };
  assert.equal(findRelockOption([tooFar], locked), null);
  assert.equal(findRelockOption([], locked), null);
  assert.equal(findRelockOption(null, locked), null);
});

test('findRelockOption matches a locked transfer on both routes', () => {
  const first = { route: '81', co: 'KMB' };
  const second = { route: '281A', co: 'KMB' };
  const locked = {
    key: itineraryKey({ kind: 'transfer', first, second, boardStops: ['S1'] }),
    kind: 'transfer',
    eta: new Date(now + 15 * 60000).toISOString(),
    first,
    second,
    boardStops: ['S1']
  };
  const target = { kind: 'transfer', first, second, boardStops: ['S1'], eta: new Date(now + 16 * 60000).toISOString() };
  const wrongSecond = { kind: 'transfer', first, second: { route: '74A', co: 'KMB' }, boardStops: ['S1'], eta: new Date(now + 15 * 60000).toISOString() };
  assert.equal(findRelockOption([wrongSecond, target], locked), target);
});
