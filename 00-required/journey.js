/** Stop-to-stop bus/minibus options: static shortlist, live refine, rank by arrival. */
import { citybusPolesAtPlaces } from './citybus.js';
import { buildClusters, clusterHasCo, expandByClusters, stopHeadingsFromGraph } from './clusters.js';
import { expandNearby, expandNearbyDiverse, namedStop, nearestStops, stopPlaceKey } from './kmb.js';
import { lookupStopMap } from './stopName.js';
import {
  attachRideTimes,
  etasAtStops,
  matchesDest,
  metresBetween,
  namedDest,
  routeStops,
  serviceCompany,
  walkMs
} from './transfer.js';
import { attachJourneyFares } from './fares.js';
import { fareDeltaAgainst, sortByWageTime, timeMinutesOfArrive } from './fareRank.js';
import { addGraphService, currentTopology, ensureTopology, getTopology, graphStopList, parseStopRef, serviceUid, servicesAtStop, stopUid } from './topology.js';

const PLAN_MS = 12000;
const ORIGIN_SERVICE_CAP = 14;
const DEST_SERVICE_CAP = 14;
const DIRECT_REFINE = 8;
const TRANSFER_REFINE = 8;
const INTERCHANGE_POLE_CAP = 12;
const MAX_OPTIONS = 8;
const ORIGIN_POLE_CAP = 16;
const DEST_POLE_CAP = 16;
const PER_AREA_POLES = 3;
const GRAPH_TRANSFER_CAP = 12;
const SECOND_SEQ_RESERVE = 3000;
const DEPART_GRACE_MS = 30 * 1000;

function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx], idx);
    }
  }
  return Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, worker)).then(() => out);
}

async function raceMs(work, ms, fallback) {
  const timeoutMs = Math.max(50, Number(ms) || 50);
  let settled = '';
  const value = await Promise.race([
    Promise.resolve(work).then((next) => {
      if (!settled) settled = 'ok';
      return next;
    }).catch(() => {
      if (!settled) settled = 'error';
      return fallback;
    }),
    new Promise((resolve) => setTimeout(() => {
      if (!settled) settled = 'timeout';
      resolve(fallback);
    }, timeoutMs))
  ]);
  return { value, timedOut: settled === 'timeout' };
}

function clampRadius(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 250;
  return Math.min(400, Math.max(150, n));
}

function mergeStopPool(allStops, graph) {
  const out = [];
  const seen = new Set();
  for (const stop of [...(allStops || []), ...graphStopList(graph)]) {
    if (!stop?.stop) continue;
    const key = stopUid(stop);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(stop);
  }
  return out;
}

function uniqStops(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    if (!row?.stop) continue;
    const key = stopUid(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function clusterIndexOf(graph, allStops) {
  if (graph?.clusters?.byUid && Object.keys(graph.clusters.byUid).length) return graph.clusters;
  const stops = [...(allStops || [])];
  for (const row of graphStopList(graph)) {
    if (row?.stop) stops.push(row);
  }
  return buildClusters(stops, { headings: stopHeadingsFromGraph(graph) });
}

function resolveStopList(stopMap, refs, fallbackStops) {
  const out = [];
  for (const ref of (refs || []).slice(0, 24)) {
    const parsed = parseStopRef(ref);
    const hit = lookupStopMap(stopMap, parsed.stop, parsed.co)
      || (fallbackStops || []).find((row) => String(row.stop) === parsed.stop && (!parsed.co || String(row.co || '').toUpperCase() === parsed.co));
    if (hit) out.push({ ...hit, co: hit.co || parsed.co || 'KMB' });
  }
  return uniqStops(out);
}

function sameService(a, b) {
  return a && b && serviceUid(a) === serviceUid(b);
}

function etaMatchesService(eta, service) {
  if (!eta || !service) return false;
  if (serviceCompany(eta) !== serviceCompany(service)) return false;
  if (String(eta.route || '').toUpperCase() !== String(service.route || '').toUpperCase()) return false;
  if (service.gmb_route_id) {
    if (String(eta.gmb_route_id || '') !== String(service.gmb_route_id)) return false;
    if (service.gmb_route_seq && eta.gmb_route_seq && String(eta.gmb_route_seq) !== String(service.gmb_route_seq)) return false;
    return true;
  }
  if (service.nlb_route_id) return String(eta.nlb_route_id || service.nlb_route_id) === String(service.nlb_route_id);
  const dir = eta.dir || eta.bound;
  if (dir && service.bound && String(dir).toUpperCase()[0] !== String(service.bound).toUpperCase()[0]) return false;
  if (service.service_type && eta.service_type && String(eta.service_type) !== String(service.service_type)) return false;
  return true;
}

function unwrapEta(row) {
  if (row?.eta && typeof row.eta === 'object' && row.stop) return row;
  if (row?.eta && row.stop) return { eta: row.eta, stop: row.stop };
  return { eta: row?.eta || row, stop: row?.stop || null };
}

function liveEtaAtStop(rows, service, boardStop, departAfter) {
  const boardUid = boardStop ? stopUid(boardStop) : '';
  const boardId = String(boardStop?.stop || '');
  return (rows || [])
    .map(unwrapEta)
    .filter((row) => {
      if (!row.eta || !etaMatchesService(row.eta, service)) return false;
      if (new Date(row.eta.eta || row.eta) < departAfter) return false;
      if (!boardStop || !row.stop) return true;
      return stopUid(row.stop) === boardUid || String(row.stop.stop || row.stop) === boardId;
    })
    .sort((a, b) => new Date(a.eta.eta || a.eta) - new Date(b.eta.eta || b.eta));
}

function serviceFromGraphRow(row) {
  return {
    co: row.co,
    route: row.route,
    bound: row.bound,
    service_type: row.service_type,
    gmb_route_id: row.gmb_route_id || undefined,
    gmb_route_seq: row.gmb_route_seq || undefined,
    nlb_route_id: row.nlb_route_id || undefined,
    orig_tc: row.orig_tc,
    dest_tc: row.dest_tc,
    orig_en: row.orig_en,
    dest_en: row.dest_en
  };
}

function serviceFromEta(eta, stop) {
  return {
    co: serviceCompany(eta),
    route: eta.route,
    bound: eta.dir || eta.bound || 'O',
    service_type: String(eta.service_type || '1'),
    gmb_route_id: eta.gmb_route_id,
    gmb_route_seq: eta.gmb_route_seq,
    nlb_route_id: eta.nlb_route_id,
    orig_tc: eta.orig_tc,
    dest_tc: eta.dest_tc,
    orig_en: eta.orig_en,
    dest_en: eta.dest_en,
    boardStop: stop
  };
}

function destIdsOf(destStops) {
  const ids = new Set();
  for (const row of destStops || []) {
    ids.add(stopUid(row));
    ids.add(String(row.stop));
  }
  return ids;
}

function destStopNearby(stop, destStops) {
  return (destStops || []).some((dest) => {
    const metres = metresBetween(stop, dest);
    return Number.isFinite(metres) && metres <= 280;
  });
}

function etaTime(row) {
  const eta = unwrapEta(row).eta;
  return new Date(eta?.eta || eta || 0).getTime();
}

function findBoardIdx(seq, originStops, seedOriginStops) {
  const seeds = (seedOriginStops && seedOriginStops.length) ? seedOriginStops : originStops;
  const seedUids = new Set(seeds.map((row) => stopUid(row)));
  const seedIds = new Set(seeds.map((row) => row.stop));
  const seedAreas = new Set(seeds.map((row) => stopPlaceKey(row)).filter(Boolean));
  const exact = seq.findIndex((row) => seedUids.has(stopUid(row)) || seedIds.has(row.stop));
  if (exact >= 0) return exact;
  const seedIdx = seq.findIndex((row) => stopPlaceKey(row) && seedAreas.has(stopPlaceKey(row)));
  if (seedIdx >= 0) return seedIdx;
  const ids = destIdsOf(originStops);
  return seq.findIndex((row) => ids.has(stopUid(row)) || ids.has(row.stop) || originStops.some((origin) => matchesDest(row, [origin], ids)));
}

function findDestIdx(seq, destStops, afterIdx) {
  const ids = destIdsOf(destStops);
  return seq.findIndex((row, i) => i > afterIdx && matchesDest(row, destStops, ids));
}

function seqFromGraph(graph, service) {
  const row = (graph.services || []).find((item) => item.uid === serviceUid(service));
  if (!row) return [];
  return (row.stopUids || []).map((uid, i) => {
    const stop = graph.stops[uid];
    if (!stop) return null;
    const seq = row.stopSeqs?.[i] ?? stop.seq ?? i + 1;
    return { ...stop, seq };
  }).filter(Boolean);
}

function nearSeedOrigin(stop, seedOriginStops, radius) {
  return (seedOriginStops || []).some((seed) => metresBetween(stop, seed) <= radius + 40);
}

function isBacktrackAlight(alight, seedOriginStops, seedDestStops, radius) {
  const origin = nearestDestStop(alight, seedOriginStops);
  const dest = nearestDestStop(alight, seedDestStops);
  if (!origin || !dest) return false;
  const originToDest = metresBetween(origin, dest);
  const alightToDest = metresBetween(alight, dest);
  if (!Number.isFinite(originToDest) || !Number.isFinite(alightToDest)) return false;
  return alightToDest > originToDest + Math.max(250, radius);
}

function secondRidesPastOrigin(seq, onIdx, destIdx, seedOriginStops, radius) {
  for (let i = onIdx + 1; i < destIdx; i += 1) {
    if (nearSeedOrigin(seq[i], seedOriginStops, radius)) return true;
  }
  return false;
}

function nearestDestStop(from, destStops) {
  let best = null;
  let bestM = Infinity;
  for (const dest of destStops || []) {
    const metres = metresBetween(from, dest);
    if (metres < bestM) {
      bestM = metres;
      best = dest;
    }
  }
  return best;
}

function walkMinutesTo(from, destStops) {
  const dest = nearestDestStop(from, destStops);
  if (!dest) return 0;
  const metres = metresBetween(from, dest);
  if (!Number.isFinite(metres) || metres < 40) return 0;
  return Math.max(1, Math.round(walkMs(from, dest) / 60000));
}

function graphTransfers(graph, originStops, destStops, radius, seedOriginStops, seedDestStops) {
  const originUids = new Set(originStops.map((row) => stopUid(row)));
  const seedUids = new Set((seedOriginStops || []).map((row) => stopUid(row)));
  const seedAreas = new Set((seedOriginStops || []).map((row) => stopPlaceKey(row)).filter(Boolean));
  const destUids = new Set(destStops.map((row) => stopUid(row)));
  const destAreas = new Set(destStops.map((row) => stopPlaceKey(row)).filter(Boolean));
  const destServices = [];
  const seenDest = new Set();
  const destPoles = [...destStops];
  if (destAreas.size && graph?.stops) {
    for (const stop of Object.values(graph.stops)) {
      if (stop?.area && destAreas.has(stop.area) && !destUids.has(stopUid(stop)) && destStopNearby(stop, destStops)) {
        destPoles.push(stop);
      }
    }
  }
  for (const dest of destPoles) {
    for (const service of servicesAtStop(graph, stopUid(dest))) {
      if (seenDest.has(service.uid)) continue;
      seenDest.add(service.uid);
      const uids = service.stopUids || [];
      const destIdx = uids.findIndex((uid) => {
        if (destUids.has(uid)) return true;
        const stop = graph.stops[uid];
        return stop && destAreas.has(stop.area) && destStopNearby(stop, destStops);
      });
      if (destIdx > 0) destServices.push({ service, destIdx });
    }
  }
  const pairs = [];
  const poles = [];
  const poleSeen = new Set();
  const pairSeen = new Set();
  const originIds = new Set(originStops.map((row) => row.stop));
  for (const origin of originStops) {
    for (const first of servicesAtStop(graph, stopUid(origin))) {
      const uids = first.stopUids || [];
      const seedBoard = uids.findIndex((uid) => {
        if (seedUids.has(uid)) return true;
        const stop = graph.stops[uid];
        return stop && stop.area && seedAreas.has(stop.area);
      });
      const board = seedBoard >= 0 ? seedBoard : uids.findIndex((uid) => originUids.has(uid));
      if (board < 0) continue;
      for (const { service: second, destIdx } of destServices) {
        if (first.uid === second.uid) continue;
        const key = `${first.uid}|${second.uid}`;
        if (pairSeen.has(key)) continue;
        let best = null;
        for (let i = board + 1; i < uids.length; i += 1) {
          const alight = graph.stops[uids[i]];
          if (!alight) continue;
          if (nearSeedOrigin(alight, seedOriginStops, radius)) continue;
          const secondUids = second.stopUids || [];
          for (let j = 0; j < destIdx; j += 1) {
            const pole = graph.stops[secondUids[j]];
            if (!pole) continue;
            const metres = metresBetween(alight, pole);
            if (metres > radius + 40) continue;
            if (originIds.has(alight.stop) && originIds.has(pole.stop)) continue;
            if (isBacktrackAlight(alight, seedOriginStops, seedDestStops, radius)) continue;
            if (!best || metres < best.metres) best = { alight, pole, metres };
          }
        }
        if (!best) continue;
        const secondSeq = (second.stopUids || []).map((uid) => graph.stops[uid]).filter(Boolean);
        const onIdx = secondSeq.findIndex((row) => row.stop === best.pole.stop);
        if (onIdx >= 0 && secondRidesPastOrigin(secondSeq, onIdx, destIdx, seedOriginStops, radius)) continue;
        pairSeen.add(key);
        pairs.push({
          first: serviceFromGraphRow(first),
          second: serviceFromGraphRow(second),
          alight: best.alight,
          pole: best.pole,
          metres: best.metres
        });
        for (const stop of [best.alight, best.pole]) {
          const uid = stopUid(stop);
          if (poleSeen.has(uid)) continue;
          poleSeen.add(uid);
          poles.push(stop);
        }
      }
    }
  }
  pairs.sort((a, b) => a.metres - b.metres);
  return { pairs: pairs.slice(0, GRAPH_TRANSFER_CAP), poles };
}

function graphDirects(graph, originStops, destStops) {
  const originUids = new Set(originStops.map((row) => stopUid(row)));
  const destUids = new Set(destStops.map((row) => stopUid(row)));
  const destAreas = new Set(destStops.map((row) => stopPlaceKey(row)).filter(Boolean));
  const seen = new Set();
  const out = [];
  for (const origin of originStops) {
    for (const service of servicesAtStop(graph, stopUid(origin))) {
      if (seen.has(service.uid)) continue;
      const uids = service.stopUids || [];
      const board = uids.findIndex((uid) => originUids.has(uid));
      if (board < 0) continue;
      const dest = uids.findIndex((uid, i) => {
        if (i <= board) return false;
        if (destUids.has(uid)) return true;
        const stop = graph.stops[uid];
        return stop && destAreas.has(stop.area) && destStopNearby(stop, destStops);
      });
      if (dest <= board) continue;
      seen.add(service.uid);
      out.push({ kind: 'direct', first: serviceFromGraphRow(service), boardUid: uids[board], destUid: uids[dest] });
    }
  }
  return out;
}

function optionKey(option) {
  return [
    option.kind,
    serviceCompany(option.first || {}),
    String(option.first?.route || '').toUpperCase(),
    serviceCompany(option.second || {}),
    String(option.second?.route || '').toUpperCase(),
    option.eta || '',
    option.fromStop || '',
    option.toStop || ''
  ].join('|');
}

function publicOption(option, extras = {}) {
  return {
    kind: option.kind,
    recommended: !!extras.recommended,
    preferred: !!option.preferred,
    slowerByMinutes: extras.slowerByMinutes ?? null,
    first: option.first,
    second: option.second || null,
    boardStops: option.boardStops || [],
    interchangeStops: option.interchangeStops || [],
    destinationStops: option.destinationStops || [],
    eta: option.eta || null,
    connectionEta: option.connectionEta || null,
    arrive: option.arrive || null,
    arrivalEstimated: !!option.arrivalEstimated,
    rideMinutes: option.rideMinutes ?? null,
    waitAfterFirstMinutes: option.waitAfterFirstMinutes ?? null,
    walkMinutes: option.walkMinutes ?? null,
    boardWalkMinutes: option.boardWalkMinutes ?? null,
    destWalkMinutes: option.destWalkMinutes ?? null,
    totalMinutes: option.totalMinutes ?? null,
    dest: option.dest || namedDest(option.second || option.first || {}),
    from: option.from || null,
    to: option.to || null,
    catchable: option.catchable !== false,
    on_seq: option.on_seq ?? null,
    off_seq: option.off_seq ?? null,
    firstOnSeq: option.firstOnSeq ?? null,
    firstOffSeq: option.firstOffSeq ?? null,
    secondOnSeq: option.secondOnSeq ?? null,
    secondOffSeq: option.secondOffSeq ?? null,
    octopus_fare_hkd: option.octopus_fare_hkd ?? null,
    section_fare_hkd: option.section_fare_hkd ?? null,
    full_fare_hkd: option.full_fare_hkd ?? null,
    discount: option.discount || null,
    cheaperByHkd: extras.cheaperByHkd ?? null,
    cheaperBetter: !!extras.cheaperBetter,
    coverage: extras.coverage
  };
}

async function refineDirect(ctx, candidate, originStops, destStops, departAfter, seedDestStops, seedOriginStops) {
  const seq = candidate.seq || await ctx.loadRouteStops(candidate.first);
  const boardIdx = findBoardIdx(seq, originStops, seedOriginStops);
  const destIdx = findDestIdx(seq, destStops, boardIdx);
  if (boardIdx < 0 || destIdx <= boardIdx) return null;
  const live = liveEtaAtStop(candidate.boardEtas, candidate.first, seq[boardIdx], departAfter);
  if (!live.length) return { missingLive: true, first: candidate.first, preferred: candidate.preferred };
  const eta = live[0].eta;
  const timed = await ctx.attachRide(candidate.first, seq, { eta: eta.eta, dest: namedDest(candidate.first) }, boardIdx, destIdx);
  if (!timed.arrive) return null;
  const boardWalkMinutes = walkMinutesTo(seq[boardIdx], seedOriginStops);
  const destWalkMinutes = walkMinutesTo(seq[destIdx], seedDestStops || destStops);
  const walkMinutes = boardWalkMinutes + destWalkMinutes;
  return {
    kind: 'direct',
    preferred: !!candidate.preferred,
    first: candidate.first,
    boardStops: [seq[boardIdx].stop],
    interchangeStops: [seq[destIdx].stop],
    destinationStops: destStops.map((row) => row.stop),
    eta: timed.eta || eta.eta,
    arrive: timed.arrive,
    arrivalEstimated: !!timed.arrivalEstimated,
    rideMinutes: timed.rideMinutes,
    totalMinutes: (timed.rideMinutes || 0) + walkMinutes,
    walkMinutes,
    boardWalkMinutes,
    destWalkMinutes,
    dest: namedDest(candidate.first),
    from: namedStop(seq[boardIdx]),
    to: namedStop(seq[destIdx]),
    fromStop: seq[boardIdx].stop,
    toStop: seq[destIdx].stop,
    on_seq: boardIdx + 1,
    off_seq: destIdx + 1,
    catchable: true
  };
}

async function refineTransfer(ctx, candidate, originStops, destStops, departAfter, seedOriginStops) {
  const firstSeq = candidate.firstSeq || await ctx.loadRouteStops(candidate.first);
  const secondSeq = candidate.secondSeq || await ctx.loadRouteStops(candidate.second);
  const boardIdx = findBoardIdx(firstSeq, originStops, seedOriginStops);
  if (boardIdx < 0) return null;
  const alightIdx = candidate.alightStop
    ? firstSeq.findIndex((row, i) => i >= boardIdx && row.stop === candidate.alightStop.stop)
    : firstSeq.findIndex((row, i) => i >= boardIdx && metresBetween(row, candidate.board2Stop) <= (candidate.radius || 250));
  const onIdx = secondSeq.findIndex((row) => row.stop === candidate.board2Stop.stop);
  const destIdx = findDestIdx(secondSeq, destStops, onIdx);
  if (alightIdx <= boardIdx || onIdx < 0 || destIdx <= onIdx) return null;
  const live = liveEtaAtStop(candidate.boardEtas, candidate.first, firstSeq[boardIdx], departAfter);
  if (!live.length) return { missingLive: true, first: candidate.first, preferred: candidate.preferred };
  const eta = live[0].eta;
  const firstTimed = await ctx.attachRide(candidate.first, firstSeq, { eta: eta.eta, dest: namedDest(candidate.first) }, boardIdx, alightIdx);
  if (!firstTimed.arrive) return null;
  const metres = metresBetween(firstSeq[alightIdx], secondSeq[onIdx]);
  const walk = metres < 40 ? 0 : walkMs(firstSeq[alightIdx], secondSeq[onIdx]);
  const readyAt = new Date(firstTimed.arrive).getTime() + walk;
  const matching = liveEtaAtStop(candidate.transferEtas, candidate.second, candidate.board2Stop, 0)
    .map((row) => row.eta)
    .sort((a, b) => new Date(a.eta) - new Date(b.eta));
  if (!matching.length) return { missingLive: true, first: candidate.first, second: candidate.second, preferred: candidate.preferred };
  const onTime = matching.filter((row) => new Date(row.eta).getTime() >= readyAt);
  const connection = onTime[0] || matching[matching.length - 1];
  const catchable = new Date(connection.eta).getTime() >= readyAt;
  const secondTimed = await ctx.attachRide(candidate.second, secondSeq, { eta: connection.eta, dest: namedDest(candidate.second) }, onIdx, destIdx);
  const arrive = secondTimed.arrive || null;
  const total = arrive ? Math.round((new Date(arrive) - new Date(eta.eta)) / 60000) : null;
  return {
    kind: 'transfer',
    preferred: !!candidate.preferred,
    first: candidate.first,
    second: candidate.second,
    boardStops: [firstSeq[boardIdx].stop],
    interchangeStops: [firstSeq[alightIdx].stop, secondSeq[onIdx].stop],
    destinationStops: destStops.map((row) => row.stop),
    eta: eta.eta,
    arrive,
    arrivalEstimated: !!(firstTimed.arrivalEstimated || secondTimed.arrivalEstimated),
    rideMinutes: (firstTimed.rideMinutes || 0) + (secondTimed.rideMinutes || 0),
    waitAfterFirstMinutes: Math.round((new Date(connection.eta) - new Date(firstTimed.arrive)) / 60000),
    walkMinutes: metres < 40 ? 0 : Math.max(1, Math.round(walk / 60000)),
    totalMinutes: total,
    dest: namedDest(candidate.second),
    from: namedStop(firstSeq[alightIdx]),
    to: namedStop(secondSeq[destIdx]),
    fromStop: firstSeq[alightIdx].stop,
    toStop: secondSeq[destIdx].stop,
    firstOnSeq: boardIdx + 1,
    firstOffSeq: alightIdx + 1,
    secondOnSeq: onIdx + 1,
    secondOffSeq: destIdx + 1,
    catchable,
    connectionEta: connection.eta
  };
}

export async function planJourneyOptions(cache, stopMap, allStops, routes, body, opts = {}) {
  const started = Date.now();
  const budget = Math.max(50, Number(opts.budgetMs) || PLAN_MS);
  const remain = () => Math.max(80, budget - (Date.now() - started));
  const radius = clampRadius(body?.radius);
  const nearby = body?.nearby !== false;
  const departAt = Date.now() - DEPART_GRACE_MS;

  let originStops = resolveStopList(stopMap, body?.originStops, allStops);
  let destStops = resolveStopList(stopMap, body?.destinationStops, allStops);
  if (!originStops.length && body?.originLat != null && body?.originLng != null) {
    originStops = nearestStops(allStops, body.originLat, body.originLng, Math.min(radius, 150), 8)
      .map((row) => ({ ...row, co: row.co || 'KMB' }));
  }
  if (!destStops.length && body?.destLat != null && body?.destLng != null) {
    destStops = nearestStops(allStops, body.destLat, body.destLng, Math.min(radius, 150), 8)
      .map((row) => ({ ...row, co: row.co || 'KMB' }));
  }
  const seedOriginStops = originStops.slice();
  const seedDestStops = destStops.slice();

  let graph = opts.graph || currentTopology();
  if (!opts.graph && opts.ensureGraph !== false) {
    if (!(graph.services || []).length) graph = await getTopology();
    if (cache) ensureTopology(cache, { routes, stops: allStops, stopMap }).catch(() => {});
  }
  if (nearby) {
    const expandRadius = radius + 40;
    const pool = mergeStopPool(allStops, graph);
    const clusters = clusterIndexOf(graph, pool);
    originStops = expandNearbyDiverse(originStops, pool, expandRadius, ORIGIN_POLE_CAP, PER_AREA_POLES);
    destStops = expandNearbyDiverse(destStops, pool, expandRadius, DEST_POLE_CAP, PER_AREA_POLES);
    originStops = uniqStops(expandByClusters(originStops, clusters, pool));
    destStops = uniqStops(expandByClusters(destStops, clusters, pool));
    const needCtbHeuristic = !clusterHasCo(clusters, seedOriginStops, 'CTB', pool)
      && !clusterHasCo(clusters, seedDestStops, 'CTB', pool);
    if (needCtbHeuristic && (opts.discoverCtbPoles || cache)) {
      const extraBox = { origin: [], dest: [] };
      const discover = opts.discoverCtbPoles
        || ((origin, dest) => citybusPolesAtPlaces(cache, routes, origin, dest, {
          radius: expandRadius,
          preferred: body?.preferredFirst,
          stopMap,
          loadSeq: opts.loadCtbSeq,
          out: extraBox
        }));
      const extraRace = await raceMs(discover(seedOriginStops, seedDestStops), Math.min(1600, Math.max(80, remain() - 9000)), extraBox);
      const extra = extraRace.value || extraBox;
      originStops = uniqStops([...originStops, ...(extra.origin || extraBox.origin || [])]);
      destStops = uniqStops([...destStops, ...(extra.dest || extraBox.dest || [])]);
    }
  }
  originStops = uniqStops(originStops);
  destStops = uniqStops(destStops);
  if (!originStops.length || !destStops.length) {
    return { options: [], emptyReason: 'incomplete', coverage: graphStatsSafe(graph) };
  }
  const originKey = stopPlaceKey(originStops[0]);
  const destKey = stopPlaceKey(destStops[0]);
  if (originKey && destKey && originKey === destKey) {
    return { options: [], emptyReason: 'same_area', coverage: graphStatsSafe(graph) };
  }

  const loadRouteStops = opts.loadRouteStops || ((service) => routeStops(cache, stopMap, service));
  const loadEtas = opts.loadEtas || ((stops) => etasAtStops(cache, stops, routes));
  const attachRide = opts.attachRide || ((service, seq, item, fromIdx, toIdx) => attachRideTimes(cache, service, seq, item, fromIdx, toIdx));
  const ctx = { loadRouteStops, loadEtas, attachRide };

  const originRace = await raceMs(loadEtas(originStops), Math.min(3500, remain()), []);
  const originLive = Array.isArray(originRace.value) ? originRace.value : [];
  const originTimedOut = !!originRace.timedOut;
  const byService = new Map();
  for (const { eta, stop } of originLive) {
    const service = serviceFromEta(eta, stop);
    const uid = serviceUid(service);
    if (!byService.has(uid)) byService.set(uid, { first: service, boardEtas: [], poles: [] });
    byService.get(uid).boardEtas.push({ eta, stop });
    byService.get(uid).poles.push(stop);
  }
  if (body?.preferredFirst?.route) {
    const uid = serviceUid(body.preferredFirst);
    if (!byService.has(uid)) {
      byService.set(uid, { first: body.preferredFirst, boardEtas: [], poles: originStops, preferred: true });
    } else {
      byService.get(uid).preferred = true;
      byService.get(uid).first = { ...byService.get(uid).first, ...body.preferredFirst };
    }
  }
  if (graph?.services?.length) {
    for (const origin of originStops) {
      for (const row of servicesAtStop(graph, stopUid(origin))) {
        const first = serviceFromGraphRow(row);
        const uid = serviceUid(first);
        if (!byService.has(uid)) byService.set(uid, { first, boardEtas: [], poles: [origin] });
      }
    }
  }

  const originCandidates = [...byService.values()]
    .sort((a, b) => Number(!!b.preferred) - Number(!!a.preferred)
      || Number(!!(b.boardEtas || []).length) - Number(!!(a.boardEtas || []).length)
      || etaTime(a.boardEtas[0]) - etaTime(b.boardEtas[0]))
    .slice(0, ORIGIN_SERVICE_CAP);

  const seqRace = await raceMs(
    mapPool(originCandidates, 5, async (row) => {
      const fromGraph = seqFromGraph(graph, row.first);
      row.seq = fromGraph.length ? fromGraph : await loadRouteStops(row.first);
      return row;
    }),
    Math.min(4000, Math.max(200, remain() - SECOND_SEQ_RESERVE)),
    originCandidates
  );
  const sequences = seqRace.value || originCandidates;
  const seqTimedOut = !!seqRace.timedOut;
  for (const row of sequences) {
    if (row?.seq?.length >= 2) addGraphService(graph, row.first, row.seq);
  }

  const destIdSet = destIdsOf(destStops);
  const directs = [];
  const transferSeeds = [];
  const directUids = new Set();
  for (const row of sequences) {
    if (!row?.seq?.length) continue;
    const boardIdx = findBoardIdx(row.seq, originStops, seedOriginStops);
    const destIdx = findDestIdx(row.seq, destStops, boardIdx);
    if (boardIdx >= 0 && destIdx > boardIdx) {
      directs.push({ ...row, kind: 'direct' });
      directUids.add(serviceUid(row.first));
    }
    if (boardIdx >= 0) {
      const poles = [];
      const seenArea = new Set();
      const span = Math.max(1, row.seq.length - boardIdx);
      const step = Math.max(2, Math.floor(span / 8));
      for (let i = boardIdx; i < row.seq.length && poles.length < 8; i += 1) {
        const stop = row.seq[i];
        const area = stopPlaceKey(stop);
        if (area && seenArea.has(area)) continue;
        if (area) seenArea.add(area);
        if (i === boardIdx || i === row.seq.length - 1 || (i - boardIdx) % step === 0) {
          poles.push(stop);
        }
      }
      transferSeeds.push({ row, boardIdx, poles });
    }
  }

  const graphDirectList = graphDirects(graph, originStops, destStops);
  for (const item of graphDirectList) {
    if (directs.some((row) => sameService(row.first, item.first))) continue;
    const liveRow = byService.get(serviceUid(item.first));
    directs.push({
      first: liveRow?.first || item.first,
      boardEtas: liveRow?.boardEtas || [],
      seq: seqFromGraph(graph, item.first),
      preferred: sameService(item.first, body?.preferredFirst)
    });
    directUids.add(serviceUid(item.first));
  }

  const preferredDirect = directs.filter((row) => row.preferred || sameService(row.first, body?.preferredFirst));
  const otherDirect = directs.filter((row) => !preferredDirect.includes(row));
  const directQueue = [...preferredDirect, ...otherDirect].slice(0, DIRECT_REFINE);

  const transferPoles = [];
  const poleSeen = new Set();
  for (const seed of transferSeeds) {
    for (const stop of seed.poles) {
      const key = stopUid(stop);
      if (poleSeen.has(key)) continue;
      poleSeen.add(key);
      transferPoles.push(stop);
      if (transferPoles.length >= INTERCHANGE_POLE_CAP) break;
    }
    if (transferPoles.length >= INTERCHANGE_POLE_CAP) break;
  }
  if (body?.preferredInterchangeStops?.length) {
    for (const ref of body.preferredInterchangeStops) {
      const parsed = parseStopRef(ref);
      const hit = lookupStopMap(stopMap, parsed.stop, parsed.co);
      if (hit && !poleSeen.has(stopUid(hit))) transferPoles.unshift(hit);
    }
  }
  const graphXfer = graphTransfers(graph, originStops, destStops, radius, seedOriginStops, seedDestStops);
  for (const stop of graphXfer.poles) {
    const key = stopUid(stop);
    if (poleSeen.has(key)) continue;
    poleSeen.add(key);
    transferPoles.push(stop);
    if (transferPoles.length >= INTERCHANGE_POLE_CAP + 8) break;
  }
  if (nearby || transferPoles.length) {
    const nearbyPoles = expandNearby(transferPoles, mergeStopPool(allStops, graph), radius).slice(0, INTERCHANGE_POLE_CAP + 8);
    for (const stop of nearbyPoles) {
      const key = stopUid(stop);
      if (poleSeen.has(key)) continue;
      poleSeen.add(key);
      transferPoles.push(stop);
      if (transferPoles.length >= INTERCHANGE_POLE_CAP + 8) break;
    }
  }

  const transferRace = transferPoles.length
    ? await raceMs(loadEtas(transferPoles), Math.min(3500, Math.max(200, remain() - SECOND_SEQ_RESERVE)), [])
    : { value: [], timedOut: false };
  const transferLive = Array.isArray(transferRace.value) ? transferRace.value : [];
  const secondByUid = new Map();
  for (const { eta, stop } of transferLive) {
    const service = serviceFromEta(eta, stop);
    const uid = serviceUid(service);
    if (!secondByUid.has(uid)) secondByUid.set(uid, { second: service, transferEtas: [], poles: [] });
    secondByUid.get(uid).transferEtas.push({ eta, stop });
    secondByUid.get(uid).poles.push(stop);
  }
  for (const pair of graphXfer.pairs) {
    const uid = serviceUid(pair.second);
    if (!secondByUid.has(uid)) secondByUid.set(uid, { second: pair.second, transferEtas: [], poles: [pair.pole] });
  }

  const graphSecondUids = new Set(graphXfer.pairs.map((pair) => serviceUid(pair.second)));
  const secondList = [...secondByUid.values()]
    .sort((a, b) => Number(graphSecondUids.has(serviceUid(b.second))) - Number(graphSecondUids.has(serviceUid(a.second))))
    .slice(0, DEST_SERVICE_CAP);
  await raceMs(mapPool(secondList, 5, async (row) => {
    const fromGraph = seqFromGraph(graph, row.second);
    row.seq = fromGraph.length ? fromGraph : await loadRouteStops(row.second);
  }), Math.max(800, Math.min(3500, remain())), null);

  const transferCandidates = [];
  for (const seed of transferSeeds) {
    for (const second of secondList) {
      if (!second.seq?.length || sameService(seed.row.first, second.second)) continue;
      if (!second.seq.some((row) => matchesDest(row, destStops, destIdSet))) continue;
      let best = null;
      for (const alight of seed.poles) {
        for (const pole of second.poles) {
          const metres = metresBetween(alight, pole);
          if (metres > radius + 40) continue;
          const on = second.seq.findIndex((row) => row.stop === pole.stop);
          const off = findDestIdx(second.seq, destStops, on);
          if (on < 0 || off <= on) continue;
          if (secondRidesPastOrigin(second.seq, on, off, seedOriginStops, radius)) continue;
          if (!best || metres < best.metres) best = { alight, pole, metres };
        }
      }
      if (!best) continue;
      if (nearSeedOrigin(best.alight, seedOriginStops, radius)) continue;
      if (isBacktrackAlight(best.alight, seedOriginStops, seedDestStops, radius)) continue;
      const originIds = new Set(originStops.map((row) => row.stop));
      if (originIds.has(best.alight.stop) && originIds.has(best.pole.stop)) continue;
      transferCandidates.push({
        kind: 'transfer',
        first: seed.row.first,
        second: second.second,
        firstSeq: seed.row.seq,
        secondSeq: second.seq,
        boardEtas: seed.row.boardEtas,
        transferEtas: second.transferEtas,
        alightStop: best.alight,
        board2Stop: best.pole,
        radius,
        preferred: !!seed.row.preferred
      });
    }
  }
  const candidateKey = (row) => `${serviceUid(row.first)}|${serviceUid(row.second)}`;
  const seenXfer = new Set(transferCandidates.map(candidateKey));
  for (const pair of graphXfer.pairs) {
    const key = `${serviceUid(pair.first)}|${serviceUid(pair.second)}`;
    if (seenXfer.has(key)) continue;
    const seed = transferSeeds.find((row) => sameService(row.row.first, pair.first))
      || originCandidates.find((row) => sameService(row.first, pair.first));
    const second = secondList.find((row) => sameService(row.second, pair.second));
    if (!seed || !second?.seq?.length) continue;
    const firstSeq = seed.row?.seq || seed.seq;
    if (!firstSeq?.length) continue;
    seenXfer.add(key);
    transferCandidates.push({
      kind: 'transfer',
      first: pair.first,
      second: pair.second,
      firstSeq,
      secondSeq: second.seq,
      boardEtas: seed.row?.boardEtas || seed.boardEtas || [],
      transferEtas: second.transferEtas,
      alightStop: pair.alight,
      board2Stop: pair.pole,
      radius,
      preferred: !!(seed.row?.preferred || seed.preferred)
    });
  }
  transferCandidates.sort((a, b) => Number(!!b.preferred) - Number(!!a.preferred) || a.radius - b.radius);
  const transferQueue = transferCandidates.slice(0, TRANSFER_REFINE);

  const refined = [];
  const missingPreferred = [];
  let directHits = [];
  let transferHits = [];
  const refineRace = await raceMs((async () => {
    directHits = await mapPool(directQueue, 3, (row) => refineDirect(ctx, row, originStops, destStops, departAt, seedDestStops, seedOriginStops));
    transferHits = await mapPool(transferQueue, 3, (row) => refineTransfer(ctx, row, originStops, destStops, departAt, seedOriginStops));
    return true;
  })(), Math.max(400, remain()), null);
  for (const row of [...directHits, ...transferHits]) {
    if (!row) continue;
    if (row.missingLive) {
      if (row.preferred) missingPreferred.push(row);
      continue;
    }
    refined.push(row);
  }

  const liveDirectUids = new Set(refined.filter((row) => row.kind === 'direct').map((row) => serviceUid(row.first)));
  let ranked = refined.filter((row) => row.kind !== 'transfer' || !liveDirectUids.has(serviceUid(row.second)));
  const wantFares = opts.fareIndex !== undefined || opts.discountIndex !== undefined || opts.attachFares === true
    || (opts.attachFares !== false && opts.ensureGraph !== false);
  if (wantFares && ranked.length) {
    ranked = await attachJourneyFares(ranked, {
      fareIndex: opts.fareIndex,
      discountIndex: opts.discountIndex
    });
  }
  ranked = sortByWageTime(ranked, (row) => timeMinutesOfArrive(row));

  const timeBest = [...ranked]
    .filter((row) => row.catchable !== false && row.arrive)
    .sort((a, b) => new Date(a.arrive) - new Date(b.arrive) || Number(a.kind === 'transfer') - Number(b.kind === 'transfer'))[0]
    || ranked.find((row) => row.arrive);

  const options = [];
  const seen = new Set();
  for (const row of ranked) {
    const key = optionKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    const delta = fareDeltaAgainst(row, timeBest);
    const slower = timeBest && row.arrive
      ? Math.max(0, Math.round((new Date(row.arrive) - new Date(timeBest.arrive)) / 60000))
      : null;
    options.push(publicOption(row, {
      recommended: options.length === 0,
      slowerByMinutes: slower && slower > 0 ? slower : null,
      cheaperByHkd: delta.cheaperByHkd,
      cheaperBetter: options.length === 0 && delta.cheaperBetter,
      coverage: graphStatsSafe(graph)
    }));
    if (options.length >= MAX_OPTIONS) break;
  }

  let emptyReason = null;
  if (!options.length) {
    if (originTimedOut && !originLive.length) emptyReason = 'timeout';
    else if (!originLive.length) emptyReason = 'no_departure';
    else if ((seqTimedOut || refineRace.timedOut) && !refined.length) emptyReason = 'timeout';
    else emptyReason = 'no_connection';
  }

  return {
    options,
    emptyReason,
    preferredMissing: missingPreferred.length ? true : false,
    coverage: graphStatsSafe(graph),
    observedOnly: true
  };
}

function graphStatsSafe(graph) {
  if (!graph) return { services: 0, stops: 0, complete: {} };
  return {
    services: (graph.services || []).length,
    stops: Object.keys(graph.stops || {}).length,
    complete: { ...(graph.complete || {}) }
  };
}

export { PLAN_MS, shortlistJourneyPaths, seqFromGraph, findBoardIdx, findDestIdx, walkMinutesTo, serviceFromGraphRow };

function shortlistJourneyPaths(graph, originStops, destStops, radius, seedOriginStops, seedDestStops) {
  return {
    directs: graphDirects(graph, originStops, destStops),
    pairs: graphTransfers(graph, originStops, destStops, radius, seedOriginStops || originStops, seedDestStops || destStops).pairs
  };
}
