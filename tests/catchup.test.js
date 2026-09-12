import test from 'node:test';
import assert from 'node:assert/strict';
import { nextLiveClock, pickMissAlt, planCatchUp, pickCatchPoles, hasLiveTripAnchor } from '../00-required/catchup.js';

function stop(id, extra = {}) {
  return {
    stop: id,
    co: extra.co || 'KMB',
    name_tc: extra.name_tc || id,
    name_en: extra.name_en || id,
    lat: extra.lat ?? 22.3,
    long: extra.long ?? 114.17,
    seq: extra.seq
  };
}

function service(route, extra = {}) {
  return {
    co: extra.co || 'KMB',
    route,
    bound: extra.bound || 'O',
    service_type: extra.service_type || '1',
    dest_tc: extra.dest_tc || '終點',
    dest_en: extra.dest_en || 'End'
  };
}

function minutesFrom(now, n) {
  return new Date(now + n * 60000).toISOString();
}

function mapFor(seq) {
  const map = new Map();
  for (const row of seq) {
    map.set(row.stop, row);
    map.set(`${row.co || 'KMB'}:${row.stop}`, row);
  }
  return map;
}

const now = Date.parse('2026-09-05T12:00:00+08:00');
const a = stop('A', { name_tc: '本站', name_en: 'Here', lat: 22.3, long: 114.17, seq: 1 });
const b = stop('B', { name_tc: '下一站', name_en: 'Next', lat: 22.3004, long: 114.1704, seq: 2 });
const c = stop('C', { name_tc: '太和邨', name_en: 'Tai Wo Estate', lat: 22.3008, long: 114.1708, seq: 3 });
const d = stop('D', { name_tc: '終點站', name_en: 'Terminus', lat: 22.32, long: 114.19, seq: 4 });
const seq = [a, b, c, d];

async function catchCase(body, followed, extra = {}) {
  return planCatchUp(null, mapFor(seq), {
    first: service('798'),
    boardStops: ['A'],
    destStops: ['D'],
    ...body
  }, [], {
    nowMs: now,
    loadRouteStops: async () => seq,
    followAlong: async () => followed,
    ...extra
  });
}

test('incomplete without a locked clock', async () => {
  const result = await planCatchUp(null, new Map(), { first: service('1'), boardStops: ['A'] });
  assert.equal(result.emptyReason, 'incomplete');
  assert.equal(result.catch, null);
});

test('does not chase the locked trip to a later pole', async () => {
  const locked = minutesFrom(now, -1);
  const nextSame = minutesFrom(now, 12);
  const result = await catchCase({
    eta: locked,
    laterEtas: [nextSame],
    lat: a.lat,
    lng: a.long
  }, {
    boardLive: null,
    leftBoard: true,
    estimated: false,
    time: minutesFrom(now, 12),
    stops: [
      { stop: 'A', name: { zh: '本站', en: 'Here' }, time: locked, estimated: true },
      { stop: 'B', name: { zh: '下一站', en: 'Next' }, time: minutesFrom(now, -0.5), estimated: true },
      { stop: 'C', name: { zh: '太和邨', en: 'Tai Wo Estate' }, time: minutesFrom(now, 6), estimated: false },
      { stop: 'D', name: { zh: '終點站', en: 'Terminus' }, time: minutesFrom(now, 12), estimated: true }
    ]
  });
  assert.equal(result.catch, null);
  assert.equal(result.backup, null);
  assert.equal(result.missSame.eta, nextSame);
  assert.equal(result.missSame.waitMinutes, 12);
});

test('empty downstream is not the next vehicle at this pole', async () => {
  const locked = minutesFrom(now, -1);
  const nextSame = minutesFrom(now, 12);
  const result = await catchCase({
    eta: locked,
    laterEtas: [nextSame],
    lat: a.lat,
    lng: a.long
  }, {
    boardLive: null,
    leftBoard: true,
    estimated: true,
    time: minutesFrom(now, 5),
    stops: [
      { stop: 'A', name: { zh: '本站', en: 'Here' }, time: locked, estimated: true },
      { stop: 'B', name: { zh: '下一站', en: 'Next' }, time: minutesFrom(now, 5), estimated: true },
      { stop: 'C', name: { zh: '太和邨', en: 'Tai Wo Estate' }, time: minutesFrom(now, 8), estimated: true }
    ]
  });
  assert.equal(result.catch, null);
  assert.equal(result.backup, null);
  assert.equal(result.missSame.eta, nextSame);
  assert.equal(result.missSame.waitMinutes, 12);
  assert.notEqual(result.catch?.busEta, nextSame);
});

test('miss-cost uses the second clock at the same pole', async () => {
  const locked = minutesFrom(now, 1);
  const second = minutesFrom(now, 12);
  assert.deepEqual(nextLiveClock([locked, second], locked, now), { eta: second, waitMinutes: 12 });
  const result = await catchCase({
    eta: locked,
    laterEtas: [second],
    lat: a.lat,
    lng: a.long
  }, {
    boardLive: locked,
    leftBoard: false,
    estimated: true,
    time: minutesFrom(now, 1),
    stops: [
      { stop: 'A', name: { zh: '本站', en: 'Here' }, time: locked, estimated: false }
    ]
  });
  assert.equal(result.catch, null);
  assert.equal(result.missSame.eta, second);
  assert.equal(result.missSame.waitMinutes, 12);
});

test('miss-alt only if passed in with a live eta and sooner than waiting', async () => {
  const locked = minutesFrom(now, 1);
  const second = minutesFrom(now, 12);
  const altEta = minutesFrom(now, 4);
  assert.equal(pickMissAlt([{ route: '85X', kind: 'direct' }], { route: '798', eta: locked }, { eta: second }, now), null);
  const hit = pickMissAlt(
    [{ route: '85X', co: 'KMB', kind: 'direct', eta: altEta }],
    { route: '798', co: 'KMB', eta: locked },
    { eta: second },
    now
  );
  assert.equal(hit.route, '85X');
  assert.equal(hit.waitMinutes, 4);
  const slower = pickMissAlt(
    [{ route: '89D', kind: 'direct', eta: minutesFrom(now, 20) }],
    { route: '798', eta: locked },
    { eta: second },
    now
  );
  assert.equal(slower, null);
  const result = await catchCase({
    eta: locked,
    laterEtas: [second],
    alternatives: [{ route: '85X', co: 'KMB', kind: 'direct', eta: altEta }]
  }, {
    boardLive: locked,
    leftBoard: false,
    stops: [{ stop: 'A', time: locked, estimated: false }]
  });
  assert.equal(result.missAlt.route, '85X');
  assert.equal(result.missAlt.waitMinutes, 4);
});

test('light rail is this-stop only', async () => {
  const locked = minutesFrom(now, 1);
  const next = minutesFrom(now, 8);
  const result = await planCatchUp(null, mapFor(seq), {
    first: { ...service('705'), co: 'LRT', line: 'LRT' },
    boardStops: ['A'],
    eta: locked,
    laterEtas: [next],
    lat: a.lat,
    lng: a.long
  }, [], { nowMs: now, loadRouteStops: async () => seq });
  assert.equal(result.catch, null);
  assert.equal(result.missSame.eta, next);
});

test('hasLiveTripAnchor refuses guessed-only hops', () => {
  assert.equal(hasLiveTripAnchor({
    boardLive: null,
    stops: [
      { stop: 'A', estimated: true },
      { stop: 'B', estimated: true }
    ]
  }), false);
  assert.equal(hasLiveTripAnchor({
    boardLive: null,
    stops: [
      { stop: 'A', estimated: true },
      { stop: 'C', estimated: false }
    ]
  }), true);
});

test('pickCatchPoles prefers the nearer walk and keeps one backup', () => {
  const followed = {
    boardLive: minutesFrom(now, 2),
    stops: [
      { stop: 'A', time: minutesFrom(now, 2), estimated: false },
      { stop: 'B', time: minutesFrom(now, 5), estimated: false },
      { stop: 'C', time: minutesFrom(now, 8), estimated: false }
    ]
  };
  const poles = pickCatchPoles({
    seq,
    boardIdx: 0,
    destIdx: 3,
    followed,
    here: a,
    nowMs: now,
    thisStopOnly: false
  });
  assert.equal(poles.catch.stop, 'B');
  assert.equal(poles.backup.stop, 'C');
});
