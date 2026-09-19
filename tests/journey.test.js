import test from 'node:test';
import assert from 'node:assert/strict';
import { citybusPolesAtPlaces, scoreCitybusForJourney } from '../00-required/citybus.js';
import { planJourneyOptions } from '../00-required/journey.js';
import { expandNearbyDiverse } from '../00-required/kmb.js';
import { keepSilentJourneyList, mergeJourneyGroups } from '../lib/journeyGroups.js';
import { nlbStopEtas } from '../00-required/nlb.js';
import { addGraphService, addGraphStop, emptyGraph, setTopologyForTests } from '../00-required/topology.js';

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

function service(route, bound = 'O', extra = {}) {
  return { co: extra.co || 'KMB', route, bound, service_type: '1', dest_tc: extra.dest_tc || '終點', dest_en: extra.dest_en || 'End', orig_tc: extra.orig_tc || '起點', orig_en: extra.orig_en || 'Start', ...extra };
}

function graphWith(services) {
  const graph = emptyGraph();
  for (const row of services) {
    for (const s of row.seq) addGraphStop(graph, s);
    addGraphService(graph, row.service, row.seq);
  }
  graph.complete.kmb = true;
  return graph;
}

const a = stop('A', { name_tc: '起點站', name_en: 'Start Stop', lat: 22.30, long: 114.17 });
const b = stop('B', { name_tc: '轉車站', name_en: 'Transfer Stop', lat: 22.31, long: 114.18 });
const c = stop('C', { name_tc: '終點站', name_en: 'End Stop', lat: 22.32, long: 114.19 });
const d = stop('D', { name_tc: '終點站', name_en: 'End Stop', lat: 22.3201, long: 114.1901 });

const first = service('1', 'O', { dest_tc: '終點站', dest_en: 'End Stop' });
const second = service('2', 'O', { dest_tc: '終點站', dest_en: 'End Stop' });
const slow = service('9', 'O', { dest_tc: '終點站', dest_en: 'End Stop' });

function minutesFromNow(n) {
  return new Date(Date.now() + n * 60000).toISOString();
}

function etasFor(map) {
  return async (stops) => {
    const rows = [];
    for (const stopRow of stops) {
      for (const eta of map[stopRow.stop] || []) rows.push({ eta, stop: stopRow });
    }
    return rows;
  };
}

function attachRideFake(overrides = {}) {
  return async (svc, seq, item, fromIdx, toIdx) => {
    const extra = overrides[`${svc.route}:${fromIdx}:${toIdx}`] || {};
    const start = new Date(item.eta).getTime();
    const ride = extra.rideMinutes ?? Math.max(1, toIdx - fromIdx) * 6;
    const arrive = extra.arrive || new Date(start + ride * 60000).toISOString();
    return {
      ...item,
      arrive,
      arrivalEstimated: extra.estimated ?? false,
      rideMinutes: ride
    };
  };
}

function at(base, north, east = 0) {
  return { lat: base.lat + north / 111000, long: base.long + east / 102000 };
}

function seqFor(services) {
  return async (svc) => {
    const row = services.find((item) => item.service.route === svc.route
      && String(item.service.co || 'KMB') === String(svc.co || 'KMB')
      && String(item.service.bound || 'O') === String(svc.bound || 'O')
      && String(item.service.service_type || '1') === String(svc.service_type || '1'));
    return row?.seq || [];
  };
}

async function planCase({ origin, dest, stops, services, etas, nearby = false, radius = 250, rides = {} }) {
  const destList = Array.isArray(dest) ? dest : [dest];
  const map = new Map();
  for (const row of stops) {
    map.set(row.stop, row);
    map.set(`${row.co || 'KMB'}:${row.stop}`, row);
  }
  return planJourneyOptions(
    null,
    map,
    stops,
    services.map((row) => row.service),
    {
      originStops: [{ co: origin.co || 'KMB', stop: origin.stop }],
      destinationStops: destList.map((row) => ({ co: row.co || 'KMB', stop: row.stop })),
      nearby,
      radius
    },
    {
      graph: graphWith(services),
      ensureGraph: false,
      loadEtas: etasFor(etas),
      loadRouteStops: seqFor(services),
      attachRide: attachRideFake(rides)
    }
  );
}

test('incomplete without origin or destination', async () => {
  const result = await planJourneyOptions(null, new Map(), [], [], {}, { graph: emptyGraph(), ensureGraph: false });
  assert.equal(result.emptyReason, 'incomplete');
  assert.equal(result.options.length, 0);
});

test('same stop area is rejected', async () => {
  const result = await planJourneyOptions(null, new Map([['A', a], ['C', { ...a, stop: 'C' }]]), [a], [], {
    originStops: [{ co: 'KMB', stop: 'A' }],
    destinationStops: [{ co: 'KMB', stop: 'A' }],
    nearby: false
  }, { graph: emptyGraph(), ensureGraph: false, loadEtas: async () => [], loadRouteStops: async () => [] });
  assert.equal(result.emptyReason, 'same_area');
});

test('direct beats a slower transfer by final arrival', async () => {
  const graph = graphWith([
    { service: first, seq: [a, b, c] },
    { service: second, seq: [b, d] }
  ]);
  setTopologyForTests(graph);
  const t0 = minutesFromNow(3);
  const t1 = minutesFromNow(4);
  const result = await planJourneyOptions(
    null,
    new Map([['A', a], ['B', b], ['C', c], ['D', d]]),
    [a, b, c, d],
    [first, second],
    { originStops: [{ co: 'KMB', stop: 'A' }], destinationStops: [{ co: 'KMB', stop: 'C' }], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        A: [{ eta: t0, route: '1', dir: 'O', co: 'KMB', dest_tc: '終點站', dest_en: 'End Stop' }],
        B: [{ eta: t1, route: '2', dir: 'O', co: 'KMB', dest_tc: '終點站', dest_en: 'End Stop' }]
      }),
      loadRouteStops: async (svc) => (svc.route === '1' ? [a, b, c] : [b, d]),
      attachRide: attachRideFake({
        '1:0:2': { rideMinutes: 12 },
        '1:0:1': { rideMinutes: 8 },
        '2:0:1': { rideMinutes: 20 }
      })
    }
  );
  assert.ok(result.options.length >= 1);
  assert.equal(result.options[0].kind, 'direct');
  assert.equal(result.options[0].first.route, '1');
  assert.equal(result.options[0].recommended, true);
});

test('preferred slower route is listed and marked', async () => {
  const graph = graphWith([
    { service: first, seq: [a, c] },
    { service: slow, seq: [a, c] }
  ]);
  const tFast = minutesFromNow(2);
  const tSlow = minutesFromNow(18);
  const result = await planJourneyOptions(
    null,
    new Map([['A', a], ['C', c]]),
    [a, c],
    [first, slow],
    {
      originStops: [{ co: 'KMB', stop: 'A' }],
      destinationStops: [{ co: 'KMB', stop: 'C' }],
      nearby: false,
      preferredFirst: slow
    },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        A: [
          { eta: tFast, route: '1', dir: 'O', co: 'KMB' },
          { eta: tSlow, route: '9', dir: 'O', co: 'KMB' }
        ]
      }),
      loadRouteStops: async (svc) => [a, c],
      attachRide: attachRideFake({
        '1:0:1': { rideMinutes: 10 },
        '9:0:1': { rideMinutes: 10 }
      })
    }
  );
  const preferred = result.options.find((row) => row.first.route === '9');
  const best = result.options[0];
  assert.equal(best.first.route, '1');
  assert.ok(preferred);
  assert.equal(preferred.preferred, true);
  assert.ok((preferred.slowerByMinutes || 0) >= 1);
});

test('empty origin feed stays empty', async () => {
  const graph = graphWith([{ service: first, seq: [a, c] }]);
  const result = await planJourneyOptions(
    null,
    new Map([['A', a], ['C', c]]),
    [a, c],
    [first],
    { originStops: [{ co: 'KMB', stop: 'A' }], destinationStops: [{ co: 'KMB', stop: 'C' }], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: async () => [],
      loadRouteStops: async () => [a, c],
      attachRide: attachRideFake()
    }
  );
  assert.equal(result.options.length, 0);
  assert.equal(result.emptyReason, 'no_departure');
});

test('operator-qualified stop ids resolve the right pole', async () => {
  const kmbC = stop('100', { co: 'KMB', name_tc: '九巴站', name_en: 'KMB stop', lat: 22.32, long: 114.19 });
  const ctbC = stop('100', { co: 'CTB', name_tc: '城巴站', name_en: 'CTB stop', lat: 22.40, long: 114.20 });
  const kmbA = stop('1', { co: 'KMB', name_tc: '起點', name_en: 'Start', lat: 22.30, long: 114.17 });
  const graph = graphWith([{ service: first, seq: [kmbA, kmbC] }]);
  const stopMap = new Map([['KMB:1', kmbA], ['KMB:100', kmbC], ['CTB:100', ctbC], ['1', kmbA], ['100', kmbC]]);
  const result = await planJourneyOptions(
    null,
    stopMap,
    [kmbA, kmbC, ctbC],
    [first],
    { originStops: ['KMB:1'], destinationStops: ['KMB:100'], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        1: [{ eta: minutesFromNow(4), route: '1', dir: 'O', co: 'KMB' }]
      }),
      loadRouteStops: async () => [kmbA, kmbC],
      attachRide: attachRideFake({ '1:0:1': { rideMinutes: 9 } })
    }
  );
  assert.equal(result.options[0]?.to?.zh, '九巴站');
});

test('missed connection is kept but not catchable', async () => {
  const graph = graphWith([
    { service: first, seq: [a, b] },
    { service: second, seq: [b, c] }
  ]);
  const board = minutesFromNow(1);
  const tooSoon = minutesFromNow(2);
  const result = await planJourneyOptions(
    null,
    new Map([['A', a], ['B', b], ['C', c]]),
    [a, b, c],
    [first, second],
    { originStops: [{ co: 'KMB', stop: 'A' }], destinationStops: [{ co: 'KMB', stop: 'C' }], nearby: false, preferredFirst: first },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        A: [{ eta: board, route: '1', dir: 'O', co: 'KMB' }],
        B: [{ eta: tooSoon, route: '2', dir: 'O', co: 'KMB' }]
      }),
      loadRouteStops: async (svc) => (svc.route === '1' ? [a, b] : [b, c]),
      attachRide: attachRideFake({
        '1:0:1': { rideMinutes: 15 },
        '2:0:1': { rideMinutes: 8 }
      })
    }
  );
  const xfer = result.options.find((row) => row.kind === 'transfer');
  assert.ok(xfer, 'expected a transfer option even when the connection is tight');
  assert.equal(xfer.catchable, false);
});

test('preferred route with no live departure is flagged', async () => {
  const graph = graphWith([
    { service: first, seq: [a, c] },
    { service: slow, seq: [a, c] }
  ]);
  const result = await planJourneyOptions(
    null,
    new Map([['A', a], ['C', c]]),
    [a, c],
    [first, slow],
    {
      originStops: [{ co: 'KMB', stop: 'A' }],
      destinationStops: [{ co: 'KMB', stop: 'C' }],
      nearby: false,
      preferredFirst: slow
    },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        A: [{ eta: minutesFromNow(3), route: '1', dir: 'O', co: 'KMB' }]
      }),
      loadRouteStops: async () => [a, c],
      attachRide: attachRideFake({ '1:0:1': { rideMinutes: 10 } })
    }
  );
  assert.equal(result.preferredMissing, true);
  assert.equal(result.options[0]?.first.route, '1');
  assert.ok(!result.options.some((row) => row.first.route === '9'));
});

test('service variants keep operator-qualified identities', async () => {
  const type2 = service('1', 'O', { service_type: '2', dest_tc: '終點站', dest_en: 'End Stop' });
  const graph = graphWith([
    { service: first, seq: [a, c] },
    { service: type2, seq: [a, c] }
  ]);
  const result = await planJourneyOptions(
    null,
    new Map([['A', a], ['C', c]]),
    [a, c],
    [first, type2],
    { originStops: [{ co: 'KMB', stop: 'A' }], destinationStops: [{ co: 'KMB', stop: 'C' }], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        A: [
          { eta: minutesFromNow(12), route: '1', dir: 'O', co: 'KMB', service_type: '1' },
          { eta: minutesFromNow(4), route: '1', dir: 'O', co: 'KMB', service_type: '2' }
        ]
      }),
      loadRouteStops: async () => [a, c],
      attachRide: attachRideFake({ '1:0:1': { rideMinutes: 8 } })
    }
  );
  assert.equal(result.options[0]?.first.service_type, '2');
});

test('nearby poles include a close operator stop', async () => {
  const near = stop('A2', { name_tc: '起點旁', name_en: 'Beside start', lat: 22.3004, long: 114.1703 });
  const graph = graphWith([{ service: first, seq: [near, c] }]);
  const result = await planJourneyOptions(
    null,
    new Map([['A', a], ['A2', near], ['C', c]]),
    [a, near, c],
    [first],
    { originStops: [{ co: 'KMB', stop: 'A' }], destinationStops: [{ co: 'KMB', stop: 'C' }], nearby: true, radius: 250 },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        A2: [{ eta: minutesFromNow(5), route: '1', dir: 'O', co: 'KMB' }]
      }),
      loadRouteStops: async () => [near, c],
      attachRide: attachRideFake({ '1:0:1': { rideMinutes: 9 } })
    }
  );
  assert.equal(result.options[0]?.first.route, '1');
  assert.equal(result.options[0]?.kind, 'direct');
});

test('partial deadline returns timeout instead of invented trips', async () => {
  const result = await planJourneyOptions(
    null,
    new Map([['A', a], ['C', c]]),
    [a, c],
    [first],
    { originStops: [{ co: 'KMB', stop: 'A' }], destinationStops: [{ co: 'KMB', stop: 'C' }], nearby: false },
    {
      graph: emptyGraph(),
      ensureGraph: false,
      budgetMs: 80,
      loadEtas: etasFor({
        A: [{ eta: minutesFromNow(3), route: '1', dir: 'O', co: 'KMB' }]
      }),
      loadRouteStops: async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return [a, c];
      },
      attachRide: attachRideFake()
    }
  );
  assert.equal(result.options.length, 0);
  assert.equal(result.emptyReason, 'timeout');
});

test('transfer option includes connection time and walk', async () => {
  const graph = graphWith([
    { service: first, seq: [a, b] },
    { service: second, seq: [b, c] }
  ]);
  const board = minutesFromNow(2);
  const connect = minutesFromNow(20);
  const result = await planJourneyOptions(
    null,
    new Map([['A', a], ['B', b], ['C', c]]),
    [a, b, c],
    [first, second],
    { originStops: [{ co: 'KMB', stop: 'A' }], destinationStops: [{ co: 'KMB', stop: 'C' }], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        A: [{ eta: board, route: '1', dir: 'O', co: 'KMB' }],
        B: [{ eta: connect, route: '2', dir: 'O', co: 'KMB' }]
      }),
      loadRouteStops: async (svc) => (svc.route === '1' ? [a, b] : [b, c]),
      attachRide: attachRideFake({
        '1:0:1': { rideMinutes: 6 },
        '2:0:1': { rideMinutes: 8 }
      })
    }
  );
  const xfer = result.options.find((row) => row.kind === 'transfer');
  assert.ok(xfer);
  assert.ok(xfer.connectionEta);
  assert.equal(xfer.walkMinutes || 0, 0);
  assert.equal(xfer.catchable, true);
});

test('uncatchable earlier arrival ranks after a catchable direct', async () => {
  const graph = graphWith([
    { service: first, seq: [a, c] },
    { service: second, seq: [b, c] },
    { service: slow, seq: [a, b] }
  ]);
  const result = await planJourneyOptions(
    null,
    new Map([['A', a], ['B', b], ['C', c]]),
    [a, b, c],
    [first, second, slow],
    { originStops: [{ co: 'KMB', stop: 'A' }], destinationStops: [{ co: 'KMB', stop: 'C' }], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        A: [
          { eta: minutesFromNow(8), route: '1', dir: 'O', co: 'KMB' },
          { eta: minutesFromNow(1), route: '9', dir: 'O', co: 'KMB' }
        ],
        B: [{ eta: minutesFromNow(3), route: '2', dir: 'O', co: 'KMB' }]
      }),
      loadRouteStops: async (svc) => (svc.route === '1' ? [a, c] : svc.route === '9' ? [a, b] : [b, c]),
      attachRide: attachRideFake({
        '1:0:1': { rideMinutes: 20 },
        '9:0:1': { rideMinutes: 12 },
        '2:0:1': { rideMinutes: 6 }
      })
    }
  );
  assert.equal(result.options[0]?.kind, 'direct');
  assert.equal(result.options[0]?.first.route, '1');
  const xfer = result.options.find((row) => row.kind === 'transfer');
  assert.ok(xfer);
  assert.equal(xfer.catchable, false);
});

test('cross-operator transfer keeps qualified stop identities', async () => {
  const kmbA = stop('KA', { co: 'KMB', name_tc: '九巴起點', name_en: 'KMB start', lat: 22.30, long: 114.17 });
  const kmbB = stop('KB', { co: 'KMB', name_tc: '九巴轉車', name_en: 'KMB transfer', lat: 22.31, long: 114.18 });
  const ctbB = stop('001100', { co: 'CTB', name_tc: '城巴轉車', name_en: 'CTB transfer', lat: 22.3102, long: 114.1802 });
  const ctbC = stop('001200', { co: 'CTB', name_tc: '城巴終點', name_en: 'CTB end', lat: 22.32, long: 114.19 });
  const kmbFirst = service('1', 'O', { dest_tc: '九巴轉車', dest_en: 'KMB transfer' });
  const ctbSecond = service('962', 'O', { co: 'CTB', dest_tc: '城巴終點', dest_en: 'CTB end' });
  const graph = graphWith([
    { service: kmbFirst, seq: [kmbA, kmbB] },
    { service: ctbSecond, seq: [ctbB, ctbC] }
  ]);
  const result = await planJourneyOptions(
    null,
    new Map([['KMB:KA', kmbA], ['KMB:KB', kmbB], ['CTB:001100', ctbB], ['CTB:001200', ctbC], ['KA', kmbA], ['001200', ctbC]]),
    [kmbA, kmbB, ctbB, ctbC],
    [kmbFirst, ctbSecond],
    { originStops: [{ co: 'KMB', stop: 'KA' }], destinationStops: [{ co: 'CTB', stop: '001200' }], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        KA: [{ eta: minutesFromNow(3), route: '1', dir: 'O', co: 'KMB' }],
        KB: [{ eta: minutesFromNow(20), route: '962', dir: 'O', co: 'CTB' }],
        '001100': [{ eta: minutesFromNow(20), route: '962', dir: 'O', co: 'CTB' }]
      }),
      loadRouteStops: async (svc) => (svc.route === '1' ? [kmbA, kmbB] : [ctbB, ctbC]),
      attachRide: attachRideFake({
        '1:0:1': { rideMinutes: 8 },
        '962:0:1': { rideMinutes: 12 }
      })
    }
  );
  const xfer = result.options.find((row) => row.kind === 'transfer');
  assert.ok(xfer);
  assert.equal(xfer.first.co, 'KMB');
  assert.equal(xfer.second.co, 'CTB');
  assert.equal(xfer.to?.zh, '城巴終點');
});

test('gmb service identity is not mixed with a same-number kmb route', async () => {
  const gmbA = stop('G1', { co: 'GMB', name_tc: '小巴起點', name_en: 'GMB start', lat: 22.30, long: 114.17 });
  const gmbC = stop('G3', { co: 'GMB', name_tc: '小巴終點', name_en: 'GMB end', lat: 22.32, long: 114.19 });
  const gmbSvc = service('11', 'O', { co: 'GMB', gmb_route_id: '2000001', gmb_route_seq: '1', dest_tc: '小巴終點', dest_en: 'GMB end' });
  const kmbSvc = service('11', 'O', { dest_tc: '九巴終點', dest_en: 'KMB end' });
  const graph = graphWith([
    { service: gmbSvc, seq: [gmbA, gmbC] },
    { service: kmbSvc, seq: [a, c] }
  ]);
  const result = await planJourneyOptions(
    null,
    new Map([['GMB:G1', gmbA], ['GMB:G3', gmbC], ['KMB:A', a], ['KMB:C', c]]),
    [gmbA, gmbC, a, c],
    [gmbSvc, kmbSvc],
    { originStops: [{ co: 'GMB', stop: 'G1' }], destinationStops: [{ co: 'GMB', stop: 'G3' }], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        G1: [{ eta: minutesFromNow(4), route: '11', dir: 'O', co: 'GMB', gmb_route_id: '2000001' }]
      }),
      loadRouteStops: async (svc) => (svc.gmb_route_id ? [gmbA, gmbC] : [a, c]),
      attachRide: attachRideFake({ '11:0:1': { rideMinutes: 11 } })
    }
  );
  assert.equal(result.options[0]?.first.co, 'GMB');
  assert.equal(result.options[0]?.first.gmb_route_id, '2000001');
  assert.ok(!result.options.some((row) => row.first.co === 'KMB'));
});

test('duplicate transfer candidates collapse to one card', async () => {
  const graph = graphWith([
    { service: first, seq: [a, b] },
    { service: second, seq: [b, c] }
  ]);
  const board = minutesFromNow(2);
  const connect = minutesFromNow(18);
  const result = await planJourneyOptions(
    null,
    new Map([['A', a], ['B', b], ['C', c]]),
    [a, b, c],
    [first, second],
    { originStops: [{ co: 'KMB', stop: 'A' }], destinationStops: [{ co: 'KMB', stop: 'C' }], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        A: [
          { eta: board, route: '1', dir: 'O', co: 'KMB' },
          { eta: board, route: '1', dir: 'O', co: 'KMB' }
        ],
        B: [
          { eta: connect, route: '2', dir: 'O', co: 'KMB' },
          { eta: connect, route: '2', dir: 'O', co: 'KMB' }
        ]
      }),
      loadRouteStops: async (svc) => (svc.route === '1' ? [a, b] : [b, c]),
      attachRide: attachRideFake({
        '1:0:1': { rideMinutes: 6 },
        '2:0:1': { rideMinutes: 8 }
      })
    }
  );
  const xfers = result.options.filter((row) => row.kind === 'transfer' && row.first.route === '1' && row.second.route === '2');
  assert.equal(xfers.length, 1);
});

test('nearby dest keeps a walkable other-area pole when the dest group has many bays', async () => {
  const origin = stop('O1', { name_tc: '第一城總站 (ST706)', name_en: 'City One Terminus (ST706)', lat: 22.386, long: 114.202 });
  const upstream = stop('U1', { name_tc: '愉田苑 (ST705)', name_en: 'Yue Tin Court (ST705)', lat: 22.386 + (150 / 111000), long: 114.202 });
  const destBays = Array.from({ length: 14 }, (_, i) => stop(`D${i}`, {
    name_tc: `尖沙咀碼頭,海港城 (YT9${String(i).padStart(2, '0')})`,
    name_en: `Star Ferry (YT9${String(i).padStart(2, '0')})`,
    lat: 22.294304,
    long: 114.169112
  }));
  const destNear = stop('N1', {
    name_tc: '九龍公園徑 (YT640)',
    name_en: 'Kowloon Park Drive (YT640)',
    lat: 22.294304 + (215 / 111000),
    long: 114.169112
  });
  const ride = service('281A', 'O', { dest_tc: '九龍站', dest_en: 'Kowloon Station' });
  const seq = [upstream, origin, destNear, stop('Z1', { name_tc: '九龍站', name_en: 'Kowloon Station', lat: 22.304, long: 114.161 })];
  const graph = graphWith([{ service: ride, seq }]);
  const all = [origin, upstream, destNear, ...destBays, seq[3]];
  const stopMap = new Map(all.map((row) => [row.stop, row]));
  const result = await planJourneyOptions(
    null,
    stopMap,
    all,
    [ride],
    {
      originStops: [{ co: 'KMB', stop: 'O1' }],
      destinationStops: destBays.map((row) => ({ co: 'KMB', stop: row.stop })),
      nearby: true,
      radius: 250
    },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        O1: [{ eta: minutesFromNow(4), route: '281A', dir: 'O', co: 'KMB', dest_tc: '九龍站' }]
      }),
      loadRouteStops: async () => seq,
      attachRide: attachRideFake({ '281A:1:2': { rideMinutes: 40 } })
    }
  );
  assert.equal(result.options[0]?.kind, 'direct');
  assert.equal(result.options[0]?.first.route, '281A');
  assert.ok(result.options[0].walkMinutes >= 1);
  assert.match(result.options[0].from?.zh || '', /第一城總站/);
});

test('graph shortlists a transfer whose interchange is not among sampled poles', async () => {
  const origin = stop('GA', { name_tc: '起點站', name_en: 'Start', lat: 22.38, long: 114.20 });
  const mid = [];
  for (let i = 1; i <= 18; i += 1) {
    mid.push(stop(`M${i}`, { name_tc: `途經${i}`, name_en: `Via ${i}`, lat: 22.38 - i * 0.004, long: 114.20 - i * 0.002 }));
  }
  const alight = stop('GX', { name_tc: '轉車站', name_en: 'Interchange', lat: 22.31, long: 114.18 });
  const dest = stop('GC', { name_tc: '終點站', name_en: 'End', lat: 22.29, long: 114.17 });
  const firstRide = service('88', 'O', { dest_tc: '遠終點', dest_en: 'Far end' });
  const secondRide = service('5', 'O', { dest_tc: '終點站', dest_en: 'End' });
  const firstSeq = [origin, ...mid.slice(0, 6), alight, ...mid.slice(6)];
  const secondSeq = [alight, dest];
  const graph = graphWith([
    { service: firstRide, seq: firstSeq },
    { service: secondRide, seq: secondSeq }
  ]);
  const all = [...firstSeq, dest];
  const result = await planJourneyOptions(
    null,
    new Map(all.map((row) => [row.stop, row])),
    all,
    [firstRide, secondRide],
    { originStops: [{ co: 'KMB', stop: 'GA' }], destinationStops: [{ co: 'KMB', stop: 'GC' }], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        GA: [{ eta: minutesFromNow(3), route: '88', dir: 'O', co: 'KMB' }],
        GX: [{ eta: minutesFromNow(25), route: '5', dir: 'O', co: 'KMB' }]
      }),
      loadRouteStops: async (svc) => (svc.route === '88' ? firstSeq : secondSeq),
      attachRide: attachRideFake({
        '88:0:7': { rideMinutes: 18 },
        '5:0:1': { rideMinutes: 10 }
      })
    }
  );
  const xfer = result.options.find((row) => row.kind === 'transfer' && row.first.route === '88' && row.second.route === '5');
  assert.ok(xfer);
});

test('graph direct keeps live etas when earlier buses fill the origin cap', async () => {
  const origin = stop('O1', { name_tc: '起點總站', name_en: 'Start Terminus', lat: 22.386, long: 114.202 });
  const dest = stop('C1', { name_tc: '終點碼頭', name_en: 'End Pier', lat: 22.294, long: 114.169 });
  const extras = Array.from({ length: 16 }, (_, i) => service(`L${i}`, 'O', { dest_tc: '別處', dest_en: 'Elsewhere' }));
  const ride = service('281A', 'O', { dest_tc: '終點碼頭', dest_en: 'End Pier' });
  const seq = [origin, dest];
  const graph = graphWith([
    { service: ride, seq },
    ...extras.map((svc) => ({ service: svc, seq: [origin, stop(`X${svc.route}`, { name_tc: '別處', name_en: 'Elsewhere', lat: 22.4, long: 114.3 })] }))
  ]);
  const all = [origin, dest, ...extras.map((svc) => stop(`X${svc.route}`, { name_tc: '別處', name_en: 'Elsewhere', lat: 22.4, long: 114.3 }))];
  const etas = {
    O1: [
      ...extras.map((svc) => ({ eta: minutesFromNow(1), route: svc.route, dir: 'O', co: 'KMB' })),
      { eta: minutesFromNow(6), route: '281A', dir: 'O', co: 'KMB' }
    ]
  };
  const result = await planJourneyOptions(
    null,
    new Map(all.map((row) => [row.stop, row])),
    all,
    [ride, ...extras],
    { originStops: [{ co: 'KMB', stop: 'O1' }], destinationStops: [{ co: 'KMB', stop: 'C1' }], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor(etas),
      loadRouteStops: async (svc) => (svc.route === '281A' ? seq : [origin, all.find((row) => row.stop === `X${svc.route}`)]),
      attachRide: attachRideFake({ '281A:0:1': { rideMinutes: 35 } })
    }
  );
  assert.equal(result.options[0]?.kind, 'direct');
  assert.equal(result.options[0]?.first.route, '281A');
});

test('backtrack transfer that goes further from dest is dropped', async () => {
  const origin = stop('OA', { name_tc: '起點總站', name_en: 'Start', lat: 22.386, long: 114.202 });
  const away = stop('OW', { name_tc: '富安花園', name_en: 'Chevalier Garden', lat: 22.417, long: 114.228 });
  const dest = stop('OC', { name_tc: '九龍醫院', name_en: 'Kowloon Hospital', lat: 22.322, long: 114.179 });
  const firstRide = service('84M', 'O', { dest_tc: '富安花園', dest_en: 'Chevalier Garden' });
  const secondRide = service('81C', 'O', { dest_tc: '尖沙咀東', dest_en: 'Tsim Sha Tsui East' });
  const graph = graphWith([
    { service: firstRide, seq: [origin, away] },
    { service: secondRide, seq: [away, dest] }
  ]);
  const result = await planJourneyOptions(
    null,
    new Map([['OA', origin], ['OW', away], ['OC', dest]]),
    [origin, away, dest],
    [firstRide, secondRide],
    { originStops: [{ co: 'KMB', stop: 'OA' }], destinationStops: [{ co: 'KMB', stop: 'OC' }], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        OA: [{ eta: minutesFromNow(3), route: '84M', dir: 'O', co: 'KMB' }],
        OW: [{ eta: minutesFromNow(12), route: '81C', dir: 'O', co: 'KMB' }]
      }),
      loadRouteStops: async (svc) => (svc.route === '84M' ? [origin, away] : [away, dest]),
      attachRide: attachRideFake({
        '84M:0:1': { rideMinutes: 12 },
        '81C:0:1': { rideMinutes: 30 }
      })
    }
  );
  assert.equal(result.options.filter((row) => row.kind === 'transfer').length, 0);
});

test('same transfer variants collapse to one card', async () => {
  const origin = stop('VA', { name_tc: '起點站', name_en: 'Start', lat: 22.30, long: 114.17 });
  const mid = stop('VB', { name_tc: '轉車站', name_en: 'Transfer', lat: 22.31, long: 114.18 });
  const dest = stop('VC', { name_tc: '終點站', name_en: 'End', lat: 22.32, long: 114.19 });
  const firstA = service('84M', 'O', { service_type: '2', dest_tc: '富安花園', dest_en: 'A' });
  const firstB = service('84M', 'O', { service_type: '3', dest_tc: '富安花園', dest_en: 'A' });
  const secondRide = service('81C', 'O', { dest_tc: '終點站', dest_en: 'End' });
  const graph = graphWith([
    { service: firstA, seq: [origin, mid] },
    { service: firstB, seq: [origin, mid] },
    { service: secondRide, seq: [mid, dest] }
  ]);
  const board = minutesFromNow(4);
  const connect = minutesFromNow(18);
  const result = await planJourneyOptions(
    null,
    new Map([['VA', origin], ['VB', mid], ['VC', dest]]),
    [origin, mid, dest],
    [firstA, firstB, secondRide],
    { originStops: [{ co: 'KMB', stop: 'VA' }], destinationStops: [{ co: 'KMB', stop: 'VC' }], nearby: false },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        VA: [
          { eta: board, route: '84M', dir: 'O', co: 'KMB', service_type: '2' },
          { eta: board, route: '84M', dir: 'O', co: 'KMB', service_type: '3' }
        ],
        VB: [{ eta: connect, route: '81C', dir: 'O', co: 'KMB' }]
      }),
      loadRouteStops: async (svc) => (svc.route === '84M' ? [origin, mid] : [mid, dest]),
      attachRide: attachRideFake({
        '84M:0:1': { rideMinutes: 8 },
        '81C:0:1': { rideMinutes: 12 }
      })
    }
  );
  const xfers = result.options.filter((row) => row.kind === 'transfer' && row.first.route === '84M' && row.second.route === '81C');
  assert.equal(xfers.length, 1);
});

test('nearby dest-serving stop just outside radius is still a walk-up direct', async () => {
  const origin = stop('NA', { name_tc: '第一城總站', name_en: 'City One Terminus', lat: 22.386, long: 114.202 });
  const near = stop('NN', {
    name_tc: '沙田第一城',
    name_en: 'City One Shatin',
    lat: 22.386 - (272 / 111000),
    long: 114.202
  });
  const dest = stop('NC', { name_tc: '九龍醫院', name_en: 'Kowloon Hospital', lat: 22.322, long: 114.179 });
  const ride = service('81C', 'O', { dest_tc: '九龍醫院', dest_en: 'Kowloon Hospital' });
  const graph = graphWith([{ service: ride, seq: [near, dest] }]);
  const result = await planJourneyOptions(
    null,
    new Map([['NA', origin], ['NN', near], ['NC', dest]]),
    [origin, near, dest],
    [ride],
    { originStops: [{ co: 'KMB', stop: 'NA' }], destinationStops: [{ co: 'KMB', stop: 'NC' }], nearby: true, radius: 250 },
    {
      graph,
      ensureGraph: false,
      loadEtas: etasFor({
        NN: [{ eta: minutesFromNow(5), route: '81C', dir: 'O', co: 'KMB' }]
      }),
      loadRouteStops: async () => [near, dest],
      attachRide: attachRideFake({ '81C:0:1': { rideMinutes: 28 } })
    }
  );
  assert.equal(result.options[0]?.kind, 'direct');
  assert.equal(result.options[0]?.first.route, '81C');
  assert.ok(result.options[0].walkMinutes >= 1);
});

test('diverse nearby keeps another place when one terminus has many bays', () => {
  const hub = { lat: 22.294, long: 114.169 };
  const bays = Array.from({ length: 14 }, (_, i) => stop(`BAY${i}`, {
    name_tc: `碼頭總站 (Y${i})`,
    name_en: `Pier Terminus (Y${i})`,
    ...hub
  }));
  const other = stop('PARK', {
    name_tc: '公園徑',
    name_en: 'Park Drive',
    ...at(hub, 215, 0)
  });
  const picked = expandNearbyDiverse(bays, [...bays, other], 250, 16, 3);
  assert.ok(picked.some((row) => row.stop === 'PARK'));
  assert.ok(picked.some((row) => row.stop === 'BAY0'));
});

test('origin terminus bays do not hide a dest-serving stop at a nearby other place', async () => {
  const origin = stop('TERM1', { name_tc: '屋邨總站 (A1)', name_en: 'Estate Terminus (A1)', lat: 22.40, long: 114.20 });
  const originBays = Array.from({ length: 10 }, (_, i) => stop(`TERM${i + 1}`, {
    name_tc: `屋邨總站 (A${i + 1})`,
    name_en: `Estate Terminus (A${i + 1})`,
    lat: 22.40,
    long: 114.20
  }));
  const nearbyBoard = stop('STREET', {
    name_tc: '屋邨街',
    name_en: 'Estate Street',
    ...at(origin, 0, 200)
  });
  const dest = stop('HOSP', { name_tc: '醫院', name_en: 'Hospital', lat: 22.32, long: 114.18 });
  const ride = service('88X', 'O', { dest_tc: '醫院', dest_en: 'Hospital' });
  const result = await planCase({
    origin,
    dest,
    stops: [...originBays, nearbyBoard, dest],
    services: [{ service: ride, seq: [nearbyBoard, dest] }],
    etas: { STREET: [{ eta: minutesFromNow(4), route: '88X', dir: 'O', co: 'KMB' }] },
    nearby: true,
    radius: 250,
    rides: { '88X:0:1': { rideMinutes: 22 } }
  });
  assert.equal(result.options[0]?.kind, 'direct');
  assert.equal(result.options[0]?.first.route, '88X');
  assert.match(result.options[0].from?.zh || '', /屋邨街/);
});

test('citybus dest bays do not hide a walkable kmb dest pole', async () => {
  const origin = stop('S1', { name_tc: '沙田站', name_en: 'Sha Tin Station', lat: 22.383, long: 114.188 });
  const destBays = Array.from({ length: 12 }, (_, i) => stop(`CTB${String(i).padStart(6, '0')}`, {
    co: 'CTB',
    name_tc: `中環碼頭 (C${i})`,
    name_en: `Central Pier (C${i})`,
    lat: 22.287,
    long: 114.158
  }));
  const kmbNear = stop('KMBPIER', {
    name_tc: '中環街市',
    name_en: 'Central Market',
    ...at({ lat: 22.287, long: 114.158 }, 180, 0)
  });
  const ride = service('170', 'O', { dest_tc: '中環', dest_en: 'Central' });
  const result = await planCase({
    origin,
    dest: destBays,
    stops: [origin, kmbNear, ...destBays],
    services: [{ service: ride, seq: [origin, kmbNear] }],
    etas: { S1: [{ eta: minutesFromNow(6), route: '170', dir: 'O', co: 'KMB' }] },
    nearby: true,
    radius: 250,
    rides: { '170:0:1': { rideMinutes: 45 } }
  });
  assert.equal(result.options[0]?.kind, 'direct');
  assert.equal(result.options[0]?.first.route, '170');
  assert.ok(result.options[0].walkMinutes >= 1);
});

test('second bus that later passes the origin is not a transfer', async () => {
  const origin = stop('HQ', { name_tc: '總站', name_en: 'Terminus', lat: 22.386, long: 114.202 });
  const near = stop('GATE', { name_tc: '總站閘口', name_en: 'Terminus Gate', ...at(origin, 0, 80) });
  const away = stop('NORTH', { name_tc: '北面站', name_en: 'North Stop', ...at(origin, 2800, 800) });
  const dest = stop('SOUTH', { name_tc: '南面站', name_en: 'South Stop', ...at(origin, -7000, -2500) });
  const firstRide = service('20A', 'O', { dest_tc: '北面站', dest_en: 'North Stop' });
  const secondRide = service('20B', 'O', { dest_tc: '南面站', dest_en: 'South Stop' });
  const result = await planCase({
    origin,
    dest,
    stops: [origin, near, away, dest],
    services: [
      { service: firstRide, seq: [origin, away] },
      { service: secondRide, seq: [away, near, dest] }
    ],
    etas: {
      HQ: [{ eta: minutesFromNow(3), route: '20A', dir: 'O', co: 'KMB' }],
      NORTH: [{ eta: minutesFromNow(15), route: '20B', dir: 'O', co: 'KMB' }]
    },
    nearby: false,
    rides: { '20A:0:1': { rideMinutes: 10 }, '20B:0:2': { rideMinutes: 28 } }
  });
  assert.equal(result.options.filter((row) => row.kind === 'transfer').length, 0);
});

test('forward transfer toward dest is kept', async () => {
  const origin = stop('F1', { name_tc: '北總站', name_en: 'North Terminus', lat: 22.40, long: 114.20 });
  const mid = stop('F2', { name_tc: '轉車站', name_en: 'Interchange', ...at(origin, -2500, -800) });
  const dest = stop('F3', { name_tc: '南總站', name_en: 'South Terminus', ...at(origin, -8000, -2400) });
  const firstRide = service('30', 'O', { dest_tc: '轉車站', dest_en: 'Interchange' });
  const secondRide = service('31', 'O', { dest_tc: '南總站', dest_en: 'South Terminus' });
  const result = await planCase({
    origin,
    dest,
    stops: [origin, mid, dest],
    services: [
      { service: firstRide, seq: [origin, mid] },
      { service: secondRide, seq: [mid, dest] }
    ],
    etas: {
      F1: [{ eta: minutesFromNow(2), route: '30', dir: 'O', co: 'KMB' }],
      F2: [{ eta: minutesFromNow(16), route: '31', dir: 'O', co: 'KMB' }]
    },
    rides: { '30:0:1': { rideMinutes: 8 }, '31:0:1': { rideMinutes: 14 } }
  });
  const xfer = result.options.find((row) => row.kind === 'transfer');
  assert.ok(xfer);
  assert.equal(xfer.first.route, '30');
  assert.equal(xfer.second.route, '31');
});

test('live direct hides a transfer onto the same second route', async () => {
  const origin = stop('P1', { name_tc: '起點', name_en: 'Start', lat: 22.35, long: 114.18 });
  const mid = stop('P2', { name_tc: '中途', name_en: 'Mid', ...at(origin, -2000, 0) });
  const dest = stop('P3', { name_tc: '終點', name_en: 'End', ...at(origin, -6000, 0) });
  const local = service('40', 'O', { dest_tc: '中途', dest_en: 'Mid' });
  const through = service('41', 'O', { dest_tc: '終點', dest_en: 'End' });
  const result = await planCase({
    origin,
    dest,
    stops: [origin, mid, dest],
    services: [
      { service: local, seq: [origin, mid] },
      { service: through, seq: [origin, mid, dest] }
    ],
    etas: {
      P1: [
        { eta: minutesFromNow(2), route: '40', dir: 'O', co: 'KMB' },
        { eta: minutesFromNow(5), route: '41', dir: 'O', co: 'KMB' }
      ],
      P2: [{ eta: minutesFromNow(18), route: '41', dir: 'O', co: 'KMB' }]
    },
    rides: { '40:0:1': { rideMinutes: 6 }, '41:0:2': { rideMinutes: 20 }, '41:1:2': { rideMinutes: 12 } }
  });
  assert.ok(result.options.some((row) => row.kind === 'direct' && row.first.route === '41'));
  assert.equal(result.options.filter((row) => row.kind === 'transfer' && row.second?.route === '41').length, 0);
});

test('alighting still at the origin cluster is not a transfer', async () => {
  const origin = stop('Q1', { name_tc: '總站', name_en: 'Terminus', lat: 22.36, long: 114.19 });
  const nextBay = stop('Q2', { name_tc: '總站旁', name_en: 'Beside terminus', ...at(origin, 0, 90) });
  const dest = stop('Q3', { name_tc: '遠終點', name_en: 'Far end', ...at(origin, -9000, -2000) });
  const firstRide = service('50', 'O', { dest_tc: '遠終點', dest_en: 'Far end' });
  const secondRide = service('51', 'O', { dest_tc: '遠終點', dest_en: 'Far end' });
  const result = await planCase({
    origin,
    dest,
    stops: [origin, nextBay, dest],
    services: [
      { service: firstRide, seq: [origin, nextBay, dest] },
      { service: secondRide, seq: [nextBay, dest] }
    ],
    etas: {
      Q1: [{ eta: minutesFromNow(3), route: '50', dir: 'O', co: 'KMB' }],
      Q2: [{ eta: minutesFromNow(8), route: '51', dir: 'O', co: 'KMB' }]
    },
    nearby: true,
    rides: { '50:0:1': { rideMinutes: 2 }, '51:0:1': { rideMinutes: 30 }, '50:0:2': { rideMinutes: 32 } }
  });
  assert.equal(result.options.filter((row) => row.kind === 'transfer' && row.first.route === '50' && row.second.route === '51').length, 0);
});

test('a dest-serving stop 400m away is not used at 150m nearby', async () => {
  const origin = stop('R1', { name_tc: '起點', name_en: 'Start', lat: 22.37, long: 114.19 });
  const far = stop('R2', { name_tc: '遠處站', name_en: 'Far stop', ...at(origin, 0, 400) });
  const dest = stop('R3', { name_tc: '終點', name_en: 'End', ...at(origin, -5000, 0) });
  const ride = service('60', 'O', { dest_tc: '終點', dest_en: 'End' });
  const result = await planCase({
    origin,
    dest,
    stops: [origin, far, dest],
    services: [{ service: ride, seq: [far, dest] }],
    etas: { R2: [{ eta: minutesFromNow(4), route: '60', dir: 'O', co: 'KMB' }] },
    nearby: true,
    radius: 150,
    rides: { '60:0:1': { rideMinutes: 18 } }
  });
  assert.equal(result.options.filter((row) => row.first?.route === '60').length, 0);
});

test('cross-operator interchange within walk radius is kept', async () => {
  const origin = stop('KA', { co: 'KMB', name_tc: '九巴起點', name_en: 'KMB start', lat: 22.33, long: 114.16 });
  const kmbAlight = stop('KB', { co: 'KMB', name_tc: '九巴落車', name_en: 'KMB alight', ...at(origin, -1800, 200) });
  const ctbBoard = stop('001888', { co: 'CTB', name_tc: '城巴上車', name_en: 'CTB board', ...at(origin, -1800, 260) });
  const dest = stop('001999', { co: 'CTB', name_tc: '城巴終點', name_en: 'CTB end', ...at(origin, -7000, 400) });
  const kmbFirst = service('72', 'O', { dest_tc: '九巴落車', dest_en: 'KMB alight' });
  const ctbSecond = service('962', 'O', { co: 'CTB', dest_tc: '城巴終點', dest_en: 'CTB end' });
  const result = await planCase({
    origin,
    dest,
    stops: [origin, kmbAlight, ctbBoard, dest],
    services: [
      { service: kmbFirst, seq: [origin, kmbAlight] },
      { service: ctbSecond, seq: [ctbBoard, dest] }
    ],
    etas: {
      KA: [{ eta: minutesFromNow(4), route: '72', dir: 'O', co: 'KMB' }],
      KB: [{ eta: minutesFromNow(22), route: '962', dir: 'O', co: 'CTB' }],
      '001888': [{ eta: minutesFromNow(22), route: '962', dir: 'O', co: 'CTB' }]
    },
    nearby: true,
    rides: { '72:0:1': { rideMinutes: 9 }, '962:0:1': { rideMinutes: 16 } }
  });
  const xfer = result.options.find((row) => row.kind === 'transfer');
  assert.ok(xfer);
  assert.equal(xfer.first.co, 'KMB');
  assert.equal(xfer.second.co, 'CTB');
});

test('nlb and kmb same route number stay separate options', async () => {
  const origin = stop('IS1', { co: 'NLB', name_tc: '嶼南起點', name_en: 'Island start', lat: 22.24, long: 113.98 });
  const dest = stop('IS2', { co: 'NLB', name_tc: '嶼南終點', name_en: 'Island end', ...at(origin, 2000, 400) });
  const kmbOrigin = stop('KL1', { name_tc: '九龍起點', name_en: 'Kowloon start', lat: 22.32, long: 114.17 });
  const kmbDest = stop('KL2', { name_tc: '九龍終點', name_en: 'Kowloon end', lat: 22.30, long: 114.17 });
  const nlbRide = service('1', 'O', { co: 'NLB', nlb_route_id: '1', dest_tc: '嶼南終點', dest_en: 'Island end' });
  const kmbRide = service('1', 'O', { dest_tc: '九龍終點', dest_en: 'Kowloon end' });
  const result = await planCase({
    origin,
    dest,
    stops: [origin, dest, kmbOrigin, kmbDest],
    services: [
      { service: nlbRide, seq: [origin, dest] },
      { service: kmbRide, seq: [kmbOrigin, kmbDest] }
    ],
    etas: {
      IS1: [{ eta: minutesFromNow(5), route: '1', dir: 'O', co: 'NLB', nlb_route_id: '1' }],
      KL1: [{ eta: minutesFromNow(2), route: '1', dir: 'O', co: 'KMB' }]
    },
    rides: { '1:0:1': { rideMinutes: 12 } }
  });
  assert.equal(result.options[0]?.first.co, 'NLB');
  assert.equal(result.options[0]?.first.route, '1');
  assert.equal(result.options.length, 1);
});

test('graph path without live eta is not shown', async () => {
  const origin = stop('G1', { name_tc: '起點', name_en: 'Start', lat: 22.34, long: 114.17 });
  const dest = stop('G2', { name_tc: '終點', name_en: 'End', ...at(origin, -4000, 0) });
  const ride = service('99', 'O', { dest_tc: '終點', dest_en: 'End' });
  const result = await planCase({
    origin,
    dest,
    stops: [origin, dest],
    services: [{ service: ride, seq: [origin, dest] }],
    etas: {},
    rides: { '99:0:1': { rideMinutes: 20 } }
  });
  assert.equal(result.options.length, 0);
  assert.equal(result.emptyReason, 'no_departure');
});

test('two different second routes are not collapsed', async () => {
  const origin = stop('T1', { name_tc: '起點', name_en: 'Start', lat: 22.35, long: 114.18 });
  const mid = stop('T2', { name_tc: '轉車站', name_en: 'Transfer', ...at(origin, -1500, 0) });
  const dest = stop('T3', { name_tc: '終點', name_en: 'End', ...at(origin, -5000, 0) });
  const firstRide = service('80', 'O', { dest_tc: '轉車站', dest_en: 'Transfer' });
  const secondA = service('81', 'O', { dest_tc: '終點', dest_en: 'End' });
  const secondB = service('82', 'O', { dest_tc: '終點', dest_en: 'End' });
  const result = await planCase({
    origin,
    dest,
    stops: [origin, mid, dest],
    services: [
      { service: firstRide, seq: [origin, mid] },
      { service: secondA, seq: [mid, dest] },
      { service: secondB, seq: [mid, dest] }
    ],
    etas: {
      T1: [{ eta: minutesFromNow(3), route: '80', dir: 'O', co: 'KMB' }],
      T2: [
        { eta: minutesFromNow(18), route: '81', dir: 'O', co: 'KMB' },
        { eta: minutesFromNow(19), route: '82', dir: 'O', co: 'KMB' }
      ]
    },
    rides: { '80:0:1': { rideMinutes: 7 }, '81:0:1': { rideMinutes: 11 }, '82:0:1': { rideMinutes: 12 } }
  });
  const seconds = new Set(result.options.filter((row) => row.kind === 'transfer').map((row) => row.second.route));
  assert.ok(seconds.has('81'));
  assert.ok(seconds.has('82'));
});

test('same route variants at the same bay merge into one itinerary group', () => {
  const early = minutesFromNow(5);
  const late = minutesFromNow(12);
  const arriveEarly = minutesFromNow(40);
  const arriveLate = minutesFromNow(48);
  const groups = mergeJourneyGroups([
    {
      kind: 'transfer',
      first: { route: '84M', co: 'KMB', service_type: '2' },
      second: { route: '81C', co: 'KMB' },
      eta: early,
      arrive: arriveEarly,
      boardStops: ['MA106'],
      fromStop: 'MA106',
      toStop: 'KC669'
    },
    {
      kind: 'transfer',
      first: { route: '84M', co: 'KMB', service_type: '3' },
      second: { route: '81C', co: 'KMB' },
      eta: late,
      arrive: arriveLate,
      boardStops: ['MA106'],
      fromStop: 'MA106',
      toStop: 'KC668'
    }
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].best.eta, early);
  assert.equal(groups[0].members.length, 2);
  assert.equal(groups[0].laterEtas.length, 1);
  assert.equal(groups[0].laterEtas[0], late);
});

test('two boarding places stay in separate itinerary groups', () => {
  const groups = mergeJourneyGroups([
    {
      kind: 'direct',
      first: { route: '1', co: 'KMB' },
      eta: minutesFromNow(5),
      arrive: minutesFromNow(30),
      boardStops: ['MA106'],
      fromStop: 'MA106'
    },
    {
      kind: 'direct',
      first: { route: '1', co: 'KMB' },
      eta: minutesFromNow(6),
      arrive: minutesFromNow(32),
      boardStops: ['MA903'],
      fromStop: 'MA903'
    }
  ]);
  assert.equal(groups.length, 2);
});

test('two GMB 11s with different route ids stay in separate groups', () => {
  const groups = mergeJourneyGroups([
    {
      kind: 'direct',
      first: { route: '11', co: 'GMB', gmb_route_id: '2000011' },
      eta: minutesFromNow(4),
      arrive: minutesFromNow(20),
      boardStops: ['G1']
    },
    {
      kind: 'direct',
      first: { route: '11', co: 'GMB', gmb_route_id: '2000099' },
      eta: minutesFromNow(5),
      arrive: minutesFromNow(22),
      boardStops: ['G1']
    }
  ]);
  assert.equal(groups.length, 2);
});

test('different routes stay in separate groups and keep fastest member', () => {
  const groups = mergeJourneyGroups([
    {
      kind: 'direct',
      first: { route: '81C', co: 'KMB' },
      eta: minutesFromNow(6),
      arrive: minutesFromNow(40)
    },
    {
      kind: 'direct',
      first: { route: '182', co: 'KMB' },
      eta: minutesFromNow(20),
      arrive: minutesFromNow(55)
    }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].best.first.route, '81C');
  assert.equal(groups[1].best.first.route, '182');
  assert.equal(groups[1].slowerByMinutes, 15);
});

test('picked terminus bays are not dropped by the per-area nearby cap', () => {
  const bays = Array.from({ length: 6 }, (_, i) => stop(`GY${i}`, {
    name_tc: `廣源巴士總站 (ST88${i})`,
    name_en: `Kwong Yuen (ST88${i})`,
    lat: 22.381,
    long: 114.216
  }));
  const picked = expandNearbyDiverse(bays, bays, 250, 16, 3);
  assert.equal(picked.length, 6);
  assert.ok(picked.some((row) => row.stop === 'GY4'));
});

test('same-place dest pole beyond 160m still matches', async () => {
  const origin = stop('GY0', { name_tc: '廣源巴士總站 (ST884)', name_en: 'Kwong Yuen', lat: 22.381, long: 114.216 });
  const destA = stop('H0', { name_tc: '九龍醫院 (KC610)', name_en: 'Kowloon Hospital', lat: 22.32177, long: 114.17918 });
  const destB = stop('H1', { name_tc: '九龍醫院 (KC668)', name_en: 'Kowloon Hospital', lat: 22.32364, long: 114.17838 });
  const ride = service('N182', 'O', { dest_tc: '中環', dest_en: 'Central' });
  const result = await planCase({
    origin,
    dest: destA,
    stops: [origin, destA, destB],
    services: [{ service: ride, seq: [origin, destB] }],
    etas: { GY0: [{ eta: minutesFromNow(8), route: 'N182', dir: 'O', co: 'KMB' }] },
    nearby: true,
    radius: 250,
    rides: { 'N182:0:1': { rideMinutes: 40 } }
  });
  assert.equal(result.options[0]?.kind, 'direct');
  assert.equal(result.options[0]?.first.route, 'N182');
});

test('nearby poles keep citybus and kmb at the same place', () => {
  const kmb = stop('HEX1', { name_tc: '中環', name_en: 'Central', lat: 22.28, long: 114.16 });
  const ctb = stop('001001', { co: 'CTB', name_tc: '中環', name_en: 'Central', lat: 22.2801, long: 114.1601 });
  const picked = expandNearbyDiverse([kmb], [kmb, ctb], 250, 16, 3);
  assert.ok(picked.some((row) => row.stop === 'HEX1'));
  assert.ok(picked.some((row) => row.co === 'CTB' && row.stop === '001001'));
});

test('planner considers a nearby citybus pole that is only in the graph', async () => {
  const origin = stop('K1', { name_tc: '九巴起點', name_en: 'KMB start', lat: 22.30, long: 114.17 });
  const ctbBoard = stop('001888', { co: 'CTB', name_tc: '城巴上車', name_en: 'CTB board', ...at(origin, 0, 180) });
  const dest = stop('001999', { co: 'CTB', name_tc: '城巴終點', name_en: 'CTB end', ...at(origin, 0, 4000) });
  const ctbRide = service('962', 'O', { co: 'CTB', dest_tc: '城巴終點', dest_en: 'CTB end' });
  const result = await planJourneyOptions(
    null,
    new Map([['KMB:K1', origin], ['K1', origin], ['CTB:001999', dest], ['001999', dest]]),
    [origin, dest],
    [ctbRide],
    {
      originStops: [{ co: 'KMB', stop: 'K1' }],
      destinationStops: [{ co: 'CTB', stop: '001999' }],
      nearby: true,
      radius: 250
    },
    {
      graph: graphWith([{ service: ctbRide, seq: [ctbBoard, dest] }]),
      ensureGraph: false,
      loadEtas: etasFor({
        '001888': [{ eta: minutesFromNow(4), route: '962', dir: 'O', co: 'CTB' }]
      }),
      loadRouteStops: async () => [ctbBoard, dest],
      attachRide: attachRideFake({ '962:0:1': { rideMinutes: 18 } })
    }
  );
  assert.equal(result.options[0]?.first.co, 'CTB');
  assert.equal(result.options[0]?.first.route, '962');
  assert.ok((result.options[0]?.walkMinutes || 0) >= 1);
});

test('nearby pole earlier clock is not shown on the seed stop', async () => {
  const seed = stop('SEED', { name_tc: '廣源巴士總站', name_en: 'Kwong Yuen', lat: 22.381, long: 114.216 });
  const near = stop('NEAR', { name_tc: '廣源巴士總站 (旁)', name_en: 'Kwong Yuen nearby', ...at(seed, 0, 180) });
  const dest = stop('DEST', { name_tc: '終點', name_en: 'End', ...at(seed, 0, 4000) });
  const ride = service('1', 'O');
  const seedEta = minutesFromNow(12);
  const nearEta = minutesFromNow(2);
  const result = await planCase({
    origin: seed,
    dest,
    stops: [seed, near, dest],
    services: [{ service: ride, seq: [seed, dest] }],
    etas: {
      SEED: [{ eta: seedEta, route: '1', dir: 'O', co: 'KMB' }],
      NEAR: [{ eta: nearEta, route: '1', dir: 'O', co: 'KMB' }]
    },
    nearby: true,
    radius: 250,
    rides: { '1:0:1': { rideMinutes: 20 } }
  });
  assert.equal(result.options[0]?.eta, seedEta);
  assert.notEqual(result.options[0]?.eta, nearEta);
});

test('timed-out origin fetch is timeout not no_departure', async () => {
  const result = await planJourneyOptions(
    null,
    new Map([['A', a], ['C', c]]),
    [a, c],
    [first],
    { originStops: [{ co: 'KMB', stop: 'A' }], destinationStops: [{ co: 'KMB', stop: 'C' }], nearby: false },
    {
      graph: graphWith([{ service: first, seq: [a, c] }]),
      ensureGraph: false,
      budgetMs: 180,
      loadEtas: () => new Promise(() => {}),
      loadRouteStops: async () => [a, c],
      attachRide: attachRideFake()
    }
  );
  assert.equal(result.options.length, 0);
  assert.equal(result.emptyReason, 'timeout');
});

test('silent refresh keeps a list only on timeout', () => {
  assert.equal(keepSilentJourneyList('timeout'), true);
  assert.equal(keepSilentJourneyList('no_departure'), false);
  assert.equal(keepSilentJourneyList('no_connection'), false);
});

test('nlb cold index does not query every NLB route', async () => {
  let fetches = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    fetches += 1;
    return { ok: true, json: async () => ({ estimatedArrivals: [] }) };
  };
  try {
    const routes = Array.from({ length: 40 }, (_, i) => ({ co: 'NLB', route: String(i), nlb_route_id: String(i) }));
    const rows = await nlbStopEtas(null, 'UNKNOWN_STOP', routes);
    assert.equal(rows.length, 0);
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = orig;
  }
});

test('798 scores as a TKO to Sha Tin citybus', () => {
  const origin = stop('TK468', { name_tc: '梁潔華小學 (TK468)', name_en: 'Leung Kit Wah Primary School', lat: 22.317, long: 114.27 });
  const dest = stop('ST607', { name_tc: '第一城寶城街 (ST607)', name_en: 'Poh Hong Street City One', lat: 22.387, long: 114.204 });
  const ride798 = service('798', 'O', { co: 'CTB', orig_tc: '調景嶺站', dest_tc: '火炭（駿洋邨）', orig_en: 'Tiu Keng Leng', dest_en: 'Fo Tan' });
  const ride962 = service('962', 'O', { co: 'CTB', orig_tc: '屯門', dest_tc: '銅鑼灣', orig_en: 'Tuen Mun', dest_en: 'Causeway Bay' });
  assert.ok(scoreCitybusForJourney(ride798, [origin], [dest]) > scoreCitybusForJourney(ride962, [origin], [dest]));
  assert.ok(scoreCitybusForJourney(ride798, [origin], [dest]) >= 6);
});

test('citybus poles at a KMB-named school are found from 798 route-stop', async () => {
  const origin = stop('TK468', { name_tc: '梁潔華小學 (TK468)', name_en: 'Leung Kit Wah Primary School', lat: 22.317, long: 114.27 });
  const dest = stop('ST607', { name_tc: '第一城寶城街 (ST607)', name_en: 'Poh Hong Street City One', lat: 22.387, long: 114.204 });
  const ctbBoard = stop('003011', { co: 'CTB', name_tc: '梁潔華小學', name_en: 'Leung Kit Wah Primary School', lat: 22.3172, long: 114.2701 });
  const ride798 = service('798', 'O', { co: 'CTB', orig_tc: '調景嶺站', dest_tc: '火炭（駿洋邨）' });
  const found = await citybusPolesAtPlaces(
    null,
    [ride798],
    [origin],
    [dest],
    { loadSeq: async () => [ctbBoard, dest] }
  );
  assert.ok(found.origin.some((row) => row.stop === '003011'));
});

test('798 from a KMB origin pole can transfer to a KMB dest bus', async () => {
  const origin = stop('TK468', { name_tc: '梁潔華小學 (TK468)', name_en: 'Leung Kit Wah Primary School', lat: 22.317, long: 114.27 });
  const ctbBoard = stop('003011', { co: 'CTB', name_tc: '梁潔華小學', name_en: 'Leung Kit Wah Primary School', lat: 22.3172, long: 114.2701 });
  const midCtb = stop('003200', { co: 'CTB', name_tc: '沙田市中心', name_en: 'Sha Tin Central', lat: 22.382, long: 114.188 });
  const midKmb = stop('ST100', { name_tc: '沙田市中心', name_en: 'Sha Tin Central', lat: 22.3821, long: 114.1881 });
  const dest = stop('ST607', { name_tc: '第一城寶城街 (ST607)', name_en: 'Poh Hong Street City One', lat: 22.387, long: 114.204 });
  const ride798 = service('798', 'O', { co: 'CTB', orig_tc: '調景嶺站', dest_tc: '火炭（駿洋邨）', dest_en: 'Fo Tan' });
  const ride89c = service('89C', 'O', { dest_tc: '觀塘', dest_en: 'Kwun Tong' });
  const t0 = minutesFromNow(4);
  const t1 = minutesFromNow(18);
  const result = await planJourneyOptions(
    null,
    new Map([
      ['KMB:TK468', origin], ['TK468', origin],
      ['KMB:ST607', dest], ['ST607', dest],
      ['KMB:ST100', midKmb], ['ST100', midKmb]
    ]),
    [origin, dest, midKmb],
    [ride798, ride89c],
    {
      originStops: [{ co: 'KMB', stop: 'TK468' }],
      destinationStops: [{ co: 'KMB', stop: 'ST607' }],
      nearby: true,
      radius: 250
    },
    {
      graph: graphWith([{ service: ride89c, seq: [midKmb, dest] }]),
      ensureGraph: false,
      discoverCtbPoles: async () => ({ origin: [ctbBoard], dest: [] }),
      loadEtas: etasFor({
        TK468: [{ eta: minutesFromNow(6), route: '296A', dir: 'O', co: 'KMB', dest_tc: '尚德' }],
        '003011': [{ eta: t0, route: '798', dir: 'O', co: 'CTB', dest_tc: '火炭（駿洋邨）' }],
        ST100: [{ eta: t1, route: '89C', dir: 'O', co: 'KMB', dest_tc: '觀塘' }],
        '003200': [{ eta: t1, route: '89C', dir: 'O', co: 'KMB', dest_tc: '觀塘' }]
      }),
      loadRouteStops: async (svc) => {
        if (svc.route === '798') return [ctbBoard, midCtb];
        if (svc.route === '89C') return [midKmb, dest];
        return [];
      },
      attachRide: attachRideFake({
        '798:0:1': { rideMinutes: 22 },
        '89C:0:1': { rideMinutes: 8 }
      })
    }
  );
  const xfer = result.options.find((row) => row.kind === 'transfer' && row.first?.route === '798' && row.second?.route === '89C');
  assert.ok(xfer);
  assert.equal(xfer.first.co, 'CTB');
  assert.equal(xfer.eta, t0);
});

test('colocated citybus pole without a live 798 clock is not invented', async () => {
  const origin = stop('TK468', { name_tc: '梁潔華小學 (TK468)', name_en: 'Leung Kit Wah Primary School', lat: 22.317, long: 114.27 });
  const ctbBoard = stop('003011', { co: 'CTB', name_tc: '梁潔華小學', name_en: 'Leung Kit Wah Primary School', lat: 22.3172, long: 114.2701 });
  const dest = stop('ST607', { name_tc: '第一城寶城街 (ST607)', name_en: 'Poh Hong Street City One', lat: 22.387, long: 114.204 });
  const ride798 = service('798', 'O', { co: 'CTB', orig_tc: '調景嶺站', dest_tc: '火炭（駿洋邨）' });
  const result = await planJourneyOptions(
    null,
    new Map([['KMB:TK468', origin], ['TK468', origin], ['KMB:ST607', dest], ['ST607', dest]]),
    [origin, dest],
    [ride798],
    {
      originStops: [{ co: 'KMB', stop: 'TK468' }],
      destinationStops: [{ co: 'KMB', stop: 'ST607' }],
      nearby: true
    },
    {
      graph: emptyGraph(),
      ensureGraph: false,
      discoverCtbPoles: async () => ({ origin: [ctbBoard], dest: [] }),
      loadEtas: etasFor({ TK468: [], '003011': [] }),
      loadRouteStops: async () => [ctbBoard, dest],
      attachRide: attachRideFake()
    }
  );
  assert.equal(result.options.length, 0);
  assert.ok(!result.options.some((row) => row.first?.route === '798'));
});

test('two live clocks on the same direct become later members', async () => {
  const early = minutesFromNow(3);
  const late = minutesFromNow(15);
  const result = await planCase({
    origin: a,
    dest: c,
    stops: [a, c],
    services: [{ service: first, seq: [a, c] }],
    etas: {
      A: [
        { eta: early, route: '1', dir: 'O', co: 'KMB', dest_tc: '終點站' },
        { eta: late, route: '1', dir: 'O', co: 'KMB', dest_tc: '終點站' }
      ]
    },
    rides: { '1:0:1': { rideMinutes: 12 } }
  });
  assert.equal(result.options.length, 2);
  assert.deepEqual(result.options.map((row) => row.first.route), ['1', '1']);
  assert.equal(result.options[0].eta, early);
  assert.equal(result.options[1].eta, late);
  const groups = mergeJourneyGroups(result.options);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].members.length, 2);
  assert.equal(groups[0].laterEtas.length, 1);
  assert.equal(groups[0].laterEtas[0], late);
});

test('later clocks of one route do not drop another route', async () => {
  const extras = Array.from({ length: 7 }, (_, i) => service(String(20 + i), 'O'));
  const services = [
    { service: first, seq: [a, c] },
    ...extras.map((svc) => ({ service: svc, seq: [a, c] }))
  ];
  const ones = Array.from({ length: 8 }, (_, i) => ({
    eta: minutesFromNow(2 + i * 8),
    route: '1',
    dir: 'O',
    co: 'KMB',
    dest_tc: '終點站'
  }));
  const otherEtas = extras.map((svc, i) => ({
    eta: minutesFromNow(6 + i),
    route: svc.route,
    dir: 'O',
    co: 'KMB',
    dest_tc: '終點站'
  }));
  const result = await planCase({
    origin: a,
    dest: c,
    stops: [a, c],
    services,
    etas: { A: [...ones, ...otherEtas] },
    rides: Object.fromEntries([
      ['1:0:1', { rideMinutes: 12 }],
      ...extras.map((svc) => [`${svc.route}:0:1`, { rideMinutes: 12 }])
    ])
  });
  assert.equal(result.options.filter((row) => row.first.route === '1').length, 4);
  for (const extra of extras) {
    assert.ok(result.options.some((row) => row.first.route === extra.route), extra.route);
  }
});

test('later first-bus clocks keep a real transfer connection', async () => {
  const t0 = minutesFromNow(3);
  const t1 = minutesFromNow(12);
  const t2 = minutesFromNow(25);
  const t2b = minutesFromNow(40);
  const result = await planCase({
    origin: a,
    dest: c,
    stops: [a, b, c],
    nearby: false,
    services: [
      { service: first, seq: [a, b] },
      { service: second, seq: [b, c] }
    ],
    etas: {
      A: [
        { eta: t0, route: '1', dir: 'O', co: 'KMB', dest_tc: '終點站' },
        { eta: t1, route: '1', dir: 'O', co: 'KMB', dest_tc: '終點站' }
      ],
      B: [
        { eta: t2, route: '2', dir: 'O', co: 'KMB', dest_tc: '終點站' },
        { eta: t2b, route: '2', dir: 'O', co: 'KMB', dest_tc: '終點站' }
      ]
    },
    rides: {
      '1:0:1': { rideMinutes: 8 },
      '2:0:1': { rideMinutes: 10 }
    }
  });
  const xfers = result.options.filter((row) => row.kind === 'transfer' && row.first.route === '1' && row.second.route === '2');
  assert.ok(xfers.length >= 2, `got ${xfers.length} transfer clocks`);
  assert.equal(xfers[0].eta, t0);
  assert.equal(xfers[1].eta, t1);
  assert.ok(xfers[0].connectionEta);
  assert.ok(xfers[1].connectionEta);
  assert.ok(new Date(xfers[1].connectionEta) >= new Date(xfers[0].connectionEta));
});

test('Fortune City One to Prince Edward keeps 281A when nearby ETAs hang', async () => {
  const fortune = stop('ST300', {
    name_tc: '置富第一城 (ST300)',
    name_en: 'FORTUNE CITY ONE (ST300)',
    lat: 22.386857,
    long: 114.203657
  });
  const terminus = stop('ST707', {
    name_tc: '第一城總站 (ST707)',
    name_en: 'CITY ONE SHA TIN BUS TERMINUS (ST707)',
    lat: 22.386051,
    long: 114.202508
  });
  const pePolice = stop('MK356', {
    name_tc: '太子站, 旺角警署 (MK356)',
    name_en: 'PRINCE EDWARD STATION, MONG KOK POLICE STATION',
    lat: 22.324645,
    long: 114.169348
  });
  const peFlower = stop('MK751', {
    name_tc: '太子站, 旺角花墟 (MK751)',
    name_en: 'PRINCE EDWARD STATION, FLOWER MARKET (MK751)',
    lat: 22.324126,
    long: 114.169855
  });
  const dummy = stop('NEAR1', { name_tc: '小瀝源', name_en: 'Siu Lek Yuen', lat: 22.3872, long: 114.2048 });
  const ride89x = service('89X', 'O', { dest_tc: '觀塘', dest_en: 'Kwun Tong' });
  const ride281 = service('281A', 'O', { dest_tc: '九龍站', dest_en: 'Kowloon Station' });
  const elsewhere = stop('KT1', { name_tc: '觀塘', name_en: 'Kwun Tong', lat: 22.312, long: 114.226 });
  const eta281 = minutesFromNow(6);
  const loadEtas = async (stops) => {
    if ((stops || []).some((row) => row.stop === 'NEAR1')) return new Promise(() => {});
    return etasFor({
      ST300: [{ eta: minutesFromNow(4), route: '89X', dir: 'O', co: 'KMB', dest_tc: '觀塘' }],
      ST707: [{ eta: eta281, route: '281A', dir: 'O', co: 'KMB', dest_tc: '九龍站' }]
    })(stops);
  };
  for (let i = 0; i < 3; i += 1) {
    const result = await planJourneyOptions(
      null,
      new Map([
        ['ST300', fortune], ['KMB:ST300', fortune],
        ['ST707', terminus], ['KMB:ST707', terminus],
        ['MK356', pePolice], ['KMB:MK356', pePolice],
        ['MK751', peFlower], ['KMB:MK751', peFlower],
        ['NEAR1', dummy], ['KT1', elsewhere]
      ]),
      [fortune, terminus, pePolice, peFlower, dummy, elsewhere],
      [ride89x, ride281],
      {
        originStops: [{ co: 'KMB', stop: 'ST300' }],
        destinationStops: [{ co: 'KMB', stop: 'MK356' }],
        nearby: true,
        radius: 250
      },
      {
        graph: graphWith([
          { service: ride89x, seq: [fortune, elsewhere] },
          { service: ride281, seq: [terminus, peFlower] }
        ]),
        ensureGraph: false,
        budgetMs: 4000,
        loadEtas,
        loadRouteStops: async (svc) => (svc.route === '281A' ? [terminus, peFlower] : [fortune, elsewhere]),
        attachRide: attachRideFake({ '281A:0:1': { rideMinutes: 35 }, '89X:0:1': { rideMinutes: 40 } })
      }
    );
    assert.equal(result.options[0]?.first.route, '281A', `attempt ${i + 1}`);
    assert.equal(result.options[0]?.kind, 'direct');
    assert.equal(result.options[0]?.eta, eta281);
    assert.equal(result.emptyReason, null);
  }
});

test('seed origin clocks are kept when extra nearby ETA fetch hangs', async () => {
  const origin = stop('SEED', { name_tc: '起點站', name_en: 'Start', lat: 22.30, long: 114.17 });
  const extra = stop('HANG', { name_tc: '附近站', name_en: 'Nearby', ...at(origin, 80, 40) });
  const dest = stop('END', { name_tc: '終點站', name_en: 'End', ...at(origin, 4000, 0) });
  const ride = service('1', 'O');
  const clock = minutesFromNow(5);
  const result = await planJourneyOptions(
    null,
    new Map([['SEED', origin], ['HANG', extra], ['END', dest]]),
    [origin, extra, dest],
    [ride],
    {
      originStops: [{ co: 'KMB', stop: 'SEED' }],
      destinationStops: [{ co: 'KMB', stop: 'END' }],
      nearby: true,
      radius: 250
    },
    {
      graph: graphWith([{ service: ride, seq: [origin, dest] }]),
      ensureGraph: false,
      budgetMs: 3000,
      loadEtas: async (stops) => {
        if ((stops || []).some((row) => row.stop === 'HANG')) return new Promise(() => {});
        return etasFor({ SEED: [{ eta: clock, route: '1', dir: 'O', co: 'KMB' }] })(stops);
      },
      loadRouteStops: async () => [origin, dest],
      attachRide: attachRideFake({ '1:0:1': { rideMinutes: 18 } })
    }
  );
  assert.equal(result.options[0]?.first.route, '1');
  assert.equal(result.options[0]?.eta, clock);
  assert.equal(result.emptyReason, null);
});

