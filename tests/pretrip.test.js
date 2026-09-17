import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCache } from '../00-required/cache.js';
import { setGtfsIndexForTests, scheduledHeadwaySec, hktDayType } from '../00-required/gtfs.js';
import { planPretrip } from '../00-required/pretrip.js';
import { estimateRideMs, tdasRideFromJson, busKmhFromCarKmh, TDAS_JAM_CAR_KMH } from '../00-required/transfer.js';
import { addGraphService, addGraphStop, emptyGraph } from '../00-required/topology.js';

function stop(id, extra = {}) {
  return {
    stop: id,
    co: extra.co || 'KMB',
    name_tc: extra.name_tc || id,
    name_en: extra.name_en || id,
    lat: extra.lat ?? 22.3,
    long: extra.long ?? 114.17
  };
}

function service(route, extra = {}) {
  return {
    co: extra.co || 'KMB',
    route,
    bound: extra.bound || 'O',
    service_type: '1',
    dest_tc: extra.dest_tc || '終點',
    dest_en: extra.dest_en || 'End',
    orig_tc: extra.orig_tc || '起點',
    orig_en: extra.orig_en || 'Start'
  };
}

const a = stop('A', { name_tc: '起點站', name_en: 'Start Stop', lat: 22.30, long: 114.17 });
const b = stop('B', { name_tc: '轉車站', name_en: 'Transfer Stop', lat: 22.31, long: 114.18 });
const c = stop('C', { name_tc: '終點站', name_en: 'End Stop', lat: 22.32, long: 114.19 });

function graphWith(rows) {
  const graph = emptyGraph();
  for (const row of rows) {
    for (const s of row.seq) addGraphStop(graph, s);
    addGraphService(graph, row.service, row.seq);
  }
  graph.complete.kmb = true;
  return graph;
}

function gtfsRow(route, extra = {}) {
  return {
    agency: 'KMB',
    route,
    longName: 'Start - End',
    ms: extra.ms ?? 20 * 60 * 1000,
    windows: extra.windows ?? [
      { days: 'wd', startSec: 5 * 3600, endSec: 23 * 3600, headwaySec: 12 * 60 },
      { days: 'sat', startSec: 5 * 3600, endSec: 23 * 3600, headwaySec: 15 * 60 }
    ]
  };
}

function fareIndex(entries) {
  const map = new Map();
  for (const [route, hkd] of entries) {
    map.set(route, [{
      route_name: route,
      company_code: 'KMB',
      bound: 'O',
      full_fare_hkd: hkd,
      orig_en: 'Start',
      dest_en: 'End',
      section_fares: [[hkd]]
    }]);
  }
  return map;
}

async function plan(body, extra = {}) {
  const first = extra.first || service('1');
  const graph = extra.graph || graphWith([{ service: first, seq: [a, c] }]);
  const stops = extra.stops || [a, b, c];
  const map = new Map();
  for (const row of stops) {
    map.set(row.stop, row);
    map.set(`${row.co || 'KMB'}:${row.stop}`, row);
  }
  return planPretrip(null, map, stops, extra.routes || [first], {
    originStops: [{ co: 'KMB', stop: a.stop }],
    destinationStops: [{ co: 'KMB', stop: c.stop }],
    nearby: false,
    date: body.date || '2026-09-07',
    arriveBy: body.arriveBy,
    ...body
  }, {
    graph,
    ensureGraph: false,
    attachFares: extra.attachFares,
    fareIndex: extra.fareIndex,
    discountIndex: extra.discountIndex || { byPair: new Map(), rows: [] },
    estimateRide: extra.estimateRide || (async () => null),
    loadRouteStops: extra.loadRouteStops
  });
}

test('slow TDAS jSpeed lengthens 估計 ride and marks jam', () => {
  const slow = tdasRideFromJson({ distM: 10000, jSpeed: '18 km/h' });
  const free = tdasRideFromJson({ distM: 10000, jSpeed: '70 km/h' });
  assert.ok(slow.ms > free.ms);
  assert.equal(slow.jam, true);
  assert.equal(free.jam, false);
  assert.ok(slow.carKmh < TDAS_JAM_CAR_KMH);
  assert.ok(busKmhFromCarKmh(18) < busKmhFromCarKmh(70));
});

test('empty TDAS json is not a traffic number', () => {
  assert.equal(tdasRideFromJson({}), null);
  assert.equal(tdasRideFromJson({ distM: 10000 }), null);
  assert.equal(tdasRideFromJson({ eta: '00:20:00' }), null);
});

test('estimateRideMs timeout or HTTP error returns null', async () => {
  const cache = createCache();
  const from = { ...a, lat: 22.3, long: 114.17, stop: 'FAR1' };
  const to = { ...c, lat: 22.35, long: 114.22, stop: 'FAR2' };
  const timeout = await estimateRideMs(cache, from, to, Date.now() + 3600000, {
    longHopOnly: false,
    fetch: async () => {
      throw new Error('timeout');
    }
  });
  assert.equal(timeout, null);
  const bad = await estimateRideMs(cache, from, to, Date.now() + 3600000, {
    longHopOnly: false,
    fetch: async () => ({ ok: false, json: async () => ({}) })
  });
  assert.equal(bad, null);
});

test('weekday headway exists and Sunday without a window is empty', () => {
  setGtfsIndexForTests({ savedAt: Date.now(), rows: [gtfsRow('1')] });
  const monday = new Date('2026-09-07T08:00:00+08:00');
  const sunday = new Date('2026-09-06T08:00:00+08:00');
  assert.equal(hktDayType(monday), 'wd');
  assert.equal(hktDayType(sunday), 'sun');
  assert.equal(scheduledHeadwaySec(service('1'), monday), 12 * 60);
  assert.equal(scheduledHeadwaySec(service('1'), sunday), null);
});

test('pretrip Sunday with no window is empty, not weekday timetable', async () => {
  setGtfsIndexForTests({ savedAt: Date.now(), rows: [gtfsRow('1')] });
  const result = await plan({ date: '2026-09-06', arriveBy: '09:00' });
  assert.equal(result.options.length, 0);
  assert.equal(result.emptyReason, 'no_service');
});

test('pretrip weekday uses 編定 duration when TDAS is empty', async () => {
  setGtfsIndexForTests({ savedAt: Date.now(), rows: [gtfsRow('1', { ms: 20 * 60 * 1000 })] });
  const result = await plan({ date: '2026-09-07', arriveBy: '09:00' });
  assert.ok(result.options.length >= 1);
  const row = result.options[0];
  assert.equal(row.rideSource, 'gtfs');
  assert.equal(row.jam, false);
  assert.equal(row.rideMinutes, 20);
  assert.equal(row.arrivalEstimated, true);
  assert.ok(row.leaveHome);
  assert.equal(row.waitMinutes, 6);
});

test('pretrip TDAS jam replaces 編定 minutes', async () => {
  setGtfsIndexForTests({ savedAt: Date.now(), rows: [gtfsRow('1', { ms: 20 * 60 * 1000 })] });
  const result = await plan({ date: '2026-09-07', arriveBy: '09:00' }, {
    estimateRide: async () => ({ ms: 40 * 60 * 1000, jam: true, carKmh: 18 })
  });
  assert.equal(result.options[0].rideSource, 'tdas');
  assert.equal(result.options[0].jam, true);
  assert.equal(result.options[0].rideMinutes, 40);
});

test('cheaper 2-minute-slower direct ranks first at SMW', async () => {
  const first = service('1');
  const second = service('2');
  const graph = graphWith([
    { service: first, seq: [a, c] },
    { service: second, seq: [a, b, c] }
  ]);
  setGtfsIndexForTests({
    savedAt: Date.now(),
    rows: [
      gtfsRow('1', { ms: 20 * 60 * 1000 }),
      gtfsRow('2', { ms: 22 * 60 * 1000 })
    ]
  });
  const result = await plan({ date: '2026-09-07', arriveBy: '09:00' }, {
    graph,
    routes: [first, second],
    attachFares: true,
    fareIndex: fareIndex([['1', 12], ['2', 7]])
  });
  assert.ok(result.options.length >= 2);
  assert.equal(result.options[0].first.route, '2');
});

test('missing fare keeps time order', async () => {
  const first = service('1');
  const second = service('2');
  const graph = graphWith([
    { service: first, seq: [a, c] },
    { service: second, seq: [a, b, c] }
  ]);
  setGtfsIndexForTests({
    savedAt: Date.now(),
    rows: [
      gtfsRow('1', { ms: 20 * 60 * 1000 }),
      gtfsRow('2', { ms: 22 * 60 * 1000 })
    ]
  });
  const result = await plan({ date: '2026-09-07', arriveBy: '09:00' }, {
    graph,
    routes: [first, second],
    attachFares: true,
    fareIndex: new Map()
  });
  assert.equal(result.options[0].first.route, '1');
  assert.equal(result.options[0].cheaperBetter, false);
});

test('pretrip source has no 1.2x peak bump and no 4-minute hop fiction', () => {
  const src = readFileSync(new URL('../00-required/pretrip.js', import.meta.url), 'utf8');
  assert.equal(/1\.2/.test(src), false);
  assert.equal(/4 \* 60 \* 1000/.test(src), false);
  assert.equal(/hopTravelMs/.test(src), false);
});
