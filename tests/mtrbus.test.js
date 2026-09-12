import test from 'node:test';
import assert from 'node:assert/strict';
import { etaFromBus, mtrBusStopsFromSchedule, mtrBusStopEtas } from '../00-required/mtrbus.js';

test('scheduled MTR Bus times are not treated as live ETAs', () => {
  assert.equal(etaFromBus({ isScheduled: '1', arrivalTimeInSecond: '90' }), null);
  assert.equal(etaFromBus({ arrivalTimeInSecond: 'not-a-number' }), null);
});

test('live MTR Bus arrival seconds become an ISO clock', () => {
  const before = Date.now();
  const eta = etaFromBus({ isScheduled: '0', arrivalTimeInSecond: '120' });
  assert.ok(eta);
  const ms = Date.parse(eta);
  assert.ok(ms >= before + 110000);
  assert.ok(ms <= before + 130000);
});

test('stop list comes from the published schedule, not invented names', () => {
  const rows = mtrBusStopsFromSchedule({
    routeName: 'K12',
    busStop: [
      { busStopId: 'TP1', busStopNameChi: '大埔墟站', busStopNameEng: 'Tai Po Market Station', latitude: 22.445, longitude: 114.17 },
      { busStopId: '', busStopNameChi: '缺號' }
    ]
  }, 'K12');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stop, 'TP1');
  assert.equal(rows[0].co, 'MTRB');
  assert.equal(rows[0].name_tc, '大埔墟站');
});

test('K12 schedule ids get official dictionary names when the live feed omits them', () => {
  const rows = mtrBusStopsFromSchedule({
    routeName: 'K12',
    busStop: [{ busStopId: 'K12-D010' }, { busStopId: 'K12-U010' }]
  }, 'K12');
  assert.equal(rows[0].name_tc, '八號花園');
  assert.equal(rows[0].name_en, 'Eightland Garden');
  assert.equal(rows[1].name_tc, '大埔墟站');
  assert.ok(rows[0].lat);
});

test('stop ETAs skip timetable rows and still find a route beyond the old 8-route cap', async () => {
  const routes = Array.from({ length: 9 }, (_, i) => ({ co: 'MTRB', route: `K${i + 10}` }));
  const wanted = 'K18';
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({
        routeName: body.routeName,
        busStop: [{
          busStopId: 'POLE1',
          bus: body.routeName === wanted
            ? [
              { isScheduled: '1', arrivalTimeInSecond: '30', destinationChi: '廣福', destinationEng: 'Kwong Fuk' },
              { isScheduled: '0', arrivalTimeInSecond: '180', destinationChi: '廣福', destinationEng: 'Kwong Fuk' }
            ]
            : []
        }]
      })
    };
  };
  try {
    const cache = { get: () => null, set: (_k, v) => v };
    const rows = await mtrBusStopEtas(cache, { stop: 'POLE1', co: 'MTRB' }, routes);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].route, 'K18');
    assert.equal(rows[0].dest_tc, '廣福');
    assert.ok(rows[0].eta);
  } finally {
    globalThis.fetch = original;
  }
});
