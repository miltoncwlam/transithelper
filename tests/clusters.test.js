import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClusters,
  clusterHasCo,
  expandByClusters,
  headingDegrees,
  headingDiff,
  metresBetween,
  uidOf
} from '../00-required/clusters.js';
import { groupNearbyStops, nearbyBoard } from '../00-required/nearbyBoard.js';
import { planJourneyOptions } from '../00-required/journey.js';
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

function service(route, bound = 'O', extra = {}) {
  return { co: extra.co || 'KMB', route, bound, service_type: '1', dest_tc: extra.dest_tc || '終點', dest_en: extra.dest_en || 'End', ...extra };
}

test('heading difference treats opposite directions as far apart', () => {
  assert.ok(headingDiff(10, 20) < 45);
  assert.ok(headingDiff(0, 180) > 45);
  assert.equal(headingDiff(null, 90), 0);
});

test('kmb and citybus poles 20m apart cluster together', () => {
  const kmb = stop('TK468', { name_tc: '梁潔華小學', lat: 22.317, long: 114.27 });
  const ctb = stop('003011', { co: 'CTB', name_tc: '梁潔華小學', lat: 22.31715, long: 114.27005 });
  const far = stop('ST607', { name_tc: '第一城', lat: 22.387, long: 114.204 });
  const index = buildClusters([kmb, ctb, far]);
  assert.equal(index.byUid[uidOf(kmb)], index.byUid[uidOf(ctb)]);
  assert.notEqual(index.byUid[uidOf(kmb)], index.byUid[uidOf(far)]);
  assert.ok(clusterHasCo(index, [kmb], 'CTB', [kmb, ctb, far]));
});

test('opposite-heading poles within 50m stay separate', () => {
  const north = stop('A', { lat: 22.3, long: 114.17 });
  const south = stop('B', { co: 'CTB', lat: 22.3002, long: 114.17 });
  const aheadN = { lat: 22.301, long: 114.17 };
  const aheadS = { lat: 22.299, long: 114.17 };
  const headings = {
    [uidOf(north)]: headingDegrees(north, aheadN),
    [uidOf(south)]: headingDegrees(south, aheadS)
  };
  assert.ok(metresBetween(north, south) < 50);
  assert.ok(headingDiff(headings[uidOf(north)], headings[uidOf(south)]) > 45);
  const index = buildClusters([north, south], { headings });
  assert.notEqual(index.byUid[uidOf(north)], index.byUid[uidOf(south)]);
});

test('expandByClusters adds the colocated citybus pole', () => {
  const kmb = stop('TK468', { name_tc: '梁潔華小學', lat: 22.317, long: 114.27 });
  const ctb = stop('003011', { co: 'CTB', name_tc: '梁潔華小學', lat: 22.31715, long: 114.27005 });
  const index = buildClusters([kmb, ctb]);
  const expanded = expandByClusters([kmb], index, [kmb, ctb]);
  assert.ok(expanded.some((row) => row.stop === '003011' && row.co === 'CTB'));
});

test('nearby groups merge colocated poles', () => {
  const kmb = { ...stop('TK468', { name_tc: '梁潔華小學', lat: 22.317, long: 114.27 }), metres: 12 };
  const ctb = { ...stop('003011', { co: 'CTB', name_tc: '梁潔華小學', lat: 22.31715, long: 114.27005 }), metres: 18 };
  const clusters = groupNearbyStops([kmb, ctb], { lat: 22.317, long: 114.27 });
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].stops.length, 2);
});

test('clustered citybus 798 is planned from a kmb origin without a heuristic', async () => {
  const origin = stop('TK468', { name_tc: '梁潔華小學', name_en: 'Leung Kit Wah Primary School', lat: 22.317, long: 114.27 });
  const ctbBoard = stop('003011', { co: 'CTB', name_tc: '梁潔華小學', name_en: 'Leung Kit Wah Primary School', lat: 22.31715, long: 114.27005 });
  const midCtb = stop('003200', { co: 'CTB', name_tc: '沙田市中心', lat: 22.382, long: 114.188 });
  const midKmb = stop('ST100', { name_tc: '沙田市中心', lat: 22.3821, long: 114.1881 });
  const dest = stop('ST607', { name_tc: '第一城寶城街', lat: 22.387, long: 114.204 });
  const ride798 = service('798', 'O', { co: 'CTB', dest_tc: '火炭（駿洋邨）', dest_en: 'Fo Tan' });
  const ride89c = service('89C', 'O', { dest_tc: '觀塘', dest_en: 'Kwun Tong' });
  const graph = emptyGraph();
  for (const row of [origin, ctbBoard, midCtb, midKmb, dest]) addGraphStop(graph, row);
  addGraphService(graph, ride798, [ctbBoard, midCtb]);
  addGraphService(graph, ride89c, [midKmb, dest]);
  const t0 = new Date(Date.now() + 4 * 60000).toISOString();
  const t1 = new Date(Date.now() + 18 * 60000).toISOString();
  const result = await planJourneyOptions(
    null,
    new Map([
      ['KMB:TK468', origin], ['TK468', origin],
      ['CTB:003011', ctbBoard], ['003011', ctbBoard],
      ['KMB:ST607', dest], ['ST607', dest],
      ['KMB:ST100', midKmb]
    ]),
    [origin, ctbBoard, dest, midKmb],
    [ride798, ride89c],
    {
      originStops: [{ co: 'KMB', stop: 'TK468' }],
      destinationStops: [{ co: 'KMB', stop: 'ST607' }],
      nearby: true,
      radius: 250
    },
    {
      graph,
      ensureGraph: false,
      loadEtas: async (stops) => {
        const rows = [];
        for (const stopRow of stops) {
          if (stopRow.stop === '003011') rows.push({ eta: { eta: t0, route: '798', dir: 'O', co: 'CTB', dest_tc: '火炭（駿洋邨）' }, stop: stopRow });
          if (stopRow.stop === 'ST100') rows.push({ eta: { eta: t1, route: '89C', dir: 'O', co: 'KMB', dest_tc: '觀塘' }, stop: stopRow });
        }
        return rows;
      },
      loadRouteStops: async (svc) => {
        if (svc.route === '798') return [ctbBoard, midCtb];
        if (svc.route === '89C') return [midKmb, dest];
        return [];
      },
      attachRide: async (svc, seq, item, fromIdx, toIdx) => {
        const ride = svc.route === '798' ? 22 : 8;
        return { ...item, arrive: new Date(new Date(item.eta).getTime() + ride * 60000).toISOString(), arrivalEstimated: false, rideMinutes: ride };
      }
    }
  );
  const xfer = result.options.find((row) => row.kind === 'transfer' && row.first?.route === '798' && row.second?.route === '89C');
  assert.ok(xfer, '798 to 89C should appear from clustered Citybus pole');
  assert.equal(xfer.eta, t0);
});

test('gps origin uses nearest poles when originStops is empty', async () => {
  const origin = stop('A', { name_tc: '起點站', lat: 22.30, long: 114.17 });
  const dest = stop('C', { name_tc: '終點站', lat: 22.32, long: 114.19 });
  const ride = service('1', 'O');
  const t0 = new Date(Date.now() + 5 * 60000).toISOString();
  const result = await planJourneyOptions(
    null,
    new Map([['KMB:A', origin], ['A', origin], ['KMB:C', dest], ['C', dest]]),
    [origin, dest],
    [ride],
    {
      originStops: [],
      destinationStops: [{ co: 'KMB', stop: 'C' }],
      originLat: 22.3001,
      originLng: 114.1701,
      nearby: true
    },
    {
      graph: emptyGraph(),
      ensureGraph: false,
      loadEtas: async (stops) => stops
        .filter((row) => row.stop === 'A')
        .map((stopRow) => ({ eta: { eta: t0, route: '1', dir: 'O', co: 'KMB', dest_tc: '終點站' }, stop: stopRow })),
      loadRouteStops: async () => [origin, dest],
      attachRide: async (svc, seq, item) => ({
        ...item,
        arrive: new Date(new Date(item.eta).getTime() + 12 * 60000).toISOString(),
        arrivalEstimated: false,
        rideMinutes: 12
      })
    }
  );
  assert.ok(result.options.some((row) => row.first?.route === '1'));
});

test('nearby board groups buses and GMB and skips empty clocks', async () => {
  const kmb = { ...stop('K1', { name_tc: '碼頭', lat: 22.2975, long: 114.1722 }), metres: 10 };
  const gmb = { ...stop('G1', { co: 'GMB', name_tc: '碼頭', lat: 22.29755, long: 114.17225 }), metres: 12 };
  const result = await nearbyBoard(null, [kmb, gmb], [], kmb.lat, kmb.long, {
    etasForStop: async (_cache, pole) => {
      if (pole.stop === 'K1') {
        return [
          { co: 'KMB', route: '1', dir: 'O', eta: new Date(Date.now() + 180000).toISOString(), dest_tc: '尖沙咀碼頭' },
          { co: 'KMB', route: '1A', dir: 'O', eta: null, dest_tc: '中環' }
        ];
      }
      return [{ co: 'GMB', route: '26', dir: 'O', eta: new Date(Date.now() + 240000).toISOString(), dest_tc: '尖沙咀' }];
    }
  });
  assert.equal(result.clusters.length, 1);
  assert.deepEqual(result.clusters[0].buses.map((row) => row.service.route), ['1']);
  assert.deepEqual(result.clusters[0].gmbs.map((row) => row.service.route), ['26']);
});

test('nearby board stays empty when every pole has an empty feed', async () => {
  const pole = { ...stop('K1', { name_tc: '碼頭', lat: 22.2975, long: 114.1722 }), metres: 10 };
  const result = await nearbyBoard(null, [pole], [], pole.lat, pole.long, {
    etasForStop: async () => []
  });
  assert.equal(result.clusters.length, 1);
  assert.equal(result.clusters[0].buses.length, 0);
  assert.equal(result.clusters[0].gmbs.length, 0);
});
