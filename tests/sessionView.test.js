import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findRelockOption,
  hasRestorableJourney,
  pickBootView,
  shouldRelock,
  RESTORE_MAX_AGE_MS
} from '../lib/sessionView.js';
import { itineraryKey } from '../lib/journeyGroups.js';

const HOUR = 60 * 60 * 1000;
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

test('planner was the last view: the planner session restores, not an old bus route', () => {
  const choice = pickBootView({
    view: 't',
    viewAt: now - 5 * 60 * 1000,
    journey,
    arrival,
    now
  });
  assert.equal(choice, 'journey');
});

test('arrivals was the last view and is fresh: last bus restores as before', () => {
  const choice = pickBootView({
    view: 'a',
    viewAt: now - 5 * 60 * 1000,
    journey: {},
    arrival,
    now
  });
  assert.equal(choice, 'arrival');
});

test('a stale arrivals view does not pop up a route from some time ago', () => {
  const stale = now - RESTORE_MAX_AGE_MS - HOUR;
  const choice = pickBootView({
    view: 'a',
    viewAt: stale,
    journey: {},
    arrival: { ...arrival, savedAt: stale },
    now
  });
  assert.equal(choice, 'nearby');
});

test('legacy install without a view pref keeps the old last-bus restore', () => {
  const legacyArrival = { route: '281A', service: arrival.service, stopIndex: '3' };
  assert.equal(pickBootView({ view: null, viewAt: 0, journey: {}, arrival: legacyArrival, now }), 'arrival');
  assert.equal(pickBootView({ view: null, viewAt: 0, journey: {}, arrival: {}, now }), 'nearby');
});

test('MTR was the last view: boot lands on the MTR tab', () => {
  assert.equal(pickBootView({ view: 'm', viewAt: now - 60000, journey: {}, arrival, now }), 'mtr');
  const stale = now - RESTORE_MAX_AGE_MS - HOUR;
  assert.equal(pickBootView({ view: 'm', viewAt: stale, journey: {}, arrival: { ...arrival, savedAt: stale }, now }), 'nearby');
});

test('planner view without a usable session falls back to a fresh last bus, then nearby', () => {
  assert.equal(
    pickBootView({ view: 't', viewAt: now - 60000, journey: {}, arrival, now }),
    'arrival'
  );
  const staleArrival = { ...arrival, savedAt: now - RESTORE_MAX_AGE_MS - HOUR };
  assert.equal(
    pickBootView({ view: 't', viewAt: now - 60000, journey: {}, arrival: staleArrival, now }),
    'nearby'
  );
  const noDest = { ...journey, destination: { label: 'B', stops: [] } };
  assert.equal(
    pickBootView({ view: 't', viewAt: now - 60000, journey: noDest, arrival, now }),
    'arrival'
  );
});

test('a stale planner session does not restore', () => {
  const stale = now - RESTORE_MAX_AGE_MS - HOUR;
  const choice = pickBootView({
    view: 't',
    viewAt: now - 60000,
    journey: { ...journey, savedAt: stale },
    arrival,
    now
  });
  assert.equal(choice, 'arrival');
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
