import { attachJourneyFares } from './fares.js';
import { fareDeltaAgainst, sortByStreetCost } from './fareRank.js';
import { scheduledHeadwaySec, scheduledTripMs, parseHktWhen, gtfsHasDayService, startGtfsLoad } from './gtfs.js';
import {
  findBoardIdx,
  findDestIdx,
  seqFromGraph,
  serviceFromGraphRow,
  shortlistJourneyPaths,
  walkMinutesTo
} from './journey.js';
import { expandNearbyDiverse, namedStop, nearestStops, stopPlaceKey } from './kmb.js';
import { lookupStopMap } from './stopName.js';
import { estimateRideMs, metresBetween, namedDest, routeStops, walkMs } from './transfer.js';
import { currentTopology, ensureTopology, getTopology, parseStopRef, serviceUid, stopUid } from './topology.js';

const DIRECT_CAP = 8;
const TRANSFER_CAP = 6;
const LONG_HOP_M = 2000;

function uniqStops(list) {
  const seen = new Set();
  const out = [];
  for (const row of list || []) {
    const key = stopUid(row);
    if (!row?.stop || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function clampRadius(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 250;
  return Math.min(400, Math.max(150, n));
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

function sectionMs(fullMs, fromIdx, toIdx, seqLen) {
  if (!fullMs) return null;
  const hops = Math.max(1, toIdx - fromIdx);
  const total = Math.max(1, (seqLen || 1) - 1);
  return Math.round(fullMs * hops / total);
}

function minutesFromMs(ms) {
  if (!ms || !Number.isFinite(ms)) return null;
  return Math.max(1, Math.round(ms / 60000));
}

function clockHkt(ms) {
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(ms));
  const num = (type) => parts.find((row) => row.type === type)?.value || '00';
  return `${num('hour')}:${num('minute')}`;
}

async function rideEstimate(cache, fromStop, toStop, departAtMs, scheduledMs, opts) {
  const metres = metresBetween(fromStop, toStop);
  const estimateRide = opts.estimateRide || ((...args) => estimateRideMs(...args));
  let tdas = null;
  if (Number.isFinite(metres) && metres >= LONG_HOP_M) {
    tdas = await estimateRide(cache, fromStop, toStop, departAtMs, opts.tdasOpts || {});
  }
  if (tdas?.ms) {
    return {
      ms: tdas.ms,
      minutes: minutesFromMs(tdas.ms),
      source: 'tdas',
      jam: !!tdas.jam,
      carKmh: tdas.carKmh ?? null
    };
  }
  if (scheduledMs) {
    return {
      ms: scheduledMs,
      minutes: minutesFromMs(scheduledMs),
      source: 'gtfs',
      jam: false,
      carKmh: null
    };
  }
  return null;
}

function waitFromHeadway(headwaySec) {
  if (!(headwaySec > 0)) return null;
  const minutes = Math.max(1, Math.round((headwaySec / 2) / 60));
  return {
    minutes,
    headwayMinutes: Math.max(1, Math.round(headwaySec / 60)),
    ms: minutes * 60000
  };
}

export async function planPretrip(cache, stopMap, allStops, routes, body, opts = {}) {
  const radius = clampRadius(body?.radius);
  const nearby = body?.nearby !== false;
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
  if (nearby && originStops.length && destStops.length) {
    originStops = uniqStops(expandNearbyDiverse(originStops, allStops, radius + 40, 16, 3));
    destStops = uniqStops(expandNearbyDiverse(destStops, allStops, radius + 40, 16, 3));
  }
  if (!originStops.length || !destStops.length) {
    return { options: [], emptyReason: 'incomplete', observedOnly: false };
  }
  if (stopPlaceKey(originStops[0]) && stopPlaceKey(originStops[0]) === stopPlaceKey(destStops[0])) {
    return { options: [], emptyReason: 'same_area', observedOnly: false };
  }

  const when = parseHktWhen(body?.arriveBy, body?.date, body?.arriveBy) || parseHktWhen(null, body?.date, '08:00');
  if (!when) return { options: [], emptyReason: 'incomplete', observedOnly: false };
  if (opts.skipGtfs !== true) await startGtfsLoad();
  const arriveByMs = body?.arriveBy ? when.getTime() : null;
  const departAtMs = arriveByMs || when.getTime();

  let graph = opts.graph || currentTopology();
  if (!opts.graph && opts.ensureGraph !== false) {
    if (!(graph.services || []).length) graph = await getTopology();
    if (cache) ensureTopology(cache, { routes, stops: allStops, stopMap }).catch(() => {});
  }
  const loadRouteStops = opts.loadRouteStops || ((service) => routeStops(cache, stopMap, service));
  const { directs, pairs } = shortlistJourneyPaths(graph, originStops, destStops, radius, seedOriginStops, seedDestStops);

  const built = [];
  let sawNoService = false;
  let sawNoDuration = false;

  for (const candidate of directs.slice(0, DIRECT_CAP)) {
    const seq = seqFromGraph(graph, candidate.first);
    const stops = seq.length ? seq : await loadRouteStops(candidate.first);
    const boardIdx = findBoardIdx(stops, originStops, seedOriginStops);
    const destIdx = findDestIdx(stops, destStops, boardIdx);
    if (boardIdx < 0 || destIdx <= boardIdx) continue;
    const first = serviceFromGraphRow(candidate.first) || candidate.first;
    if (gtfsHasDayService(first, when) === false) {
      sawNoService = true;
      continue;
    }
    const headwaySec = scheduledHeadwaySec(first, when);
    if (!headwaySec) {
      sawNoService = true;
      continue;
    }
    const wait = waitFromHeadway(headwaySec);
    const scheduled = sectionMs(scheduledTripMs(first), boardIdx, destIdx, stops.length);
    const ride = await rideEstimate(cache, stops[boardIdx], stops[destIdx], departAtMs, scheduled, opts);
    if (!ride) {
      sawNoDuration = true;
      continue;
    }
    const boardWalkMinutes = walkMinutesTo(stops[boardIdx], seedOriginStops);
    const destWalkMinutes = walkMinutesTo(stops[destIdx], seedDestStops);
    const walkMinutes = boardWalkMinutes + destWalkMinutes;
    const doorMinutes = (wait.minutes || 0) + (ride.minutes || 0) + walkMinutes;
    const leaveMs = arriveByMs
      ? arriveByMs - destWalkMinutes * 60000 - ride.ms - wait.ms - boardWalkMinutes * 60000
      : null;
    built.push({
      kind: 'direct',
      catchable: true,
      first,
      boardStops: [stops[boardIdx].stop],
      interchangeStops: [stops[destIdx].stop],
      destinationStops: destStops.map((row) => row.stop),
      dest: namedDest(first),
      from: namedStop(stops[boardIdx]),
      to: namedStop(stops[destIdx]),
      fromStop: stops[boardIdx].stop,
      toStop: stops[destIdx].stop,
      on_seq: boardIdx + 1,
      off_seq: destIdx + 1,
      walkMinutes,
      boardWalkMinutes,
      destWalkMinutes,
      rideMinutes: ride.minutes,
      waitMinutes: wait.minutes,
      headwayMinutes: wait.headwayMinutes,
      doorMinutes,
      rideSource: ride.source,
      jam: ride.jam,
      leaveHome: leaveMs != null ? clockHkt(leaveMs) : null,
      leaveHomeMs: leaveMs,
      scheduled: true
    });
  }

  for (const pair of pairs.slice(0, TRANSFER_CAP)) {
    const firstSeq = seqFromGraph(graph, pair.first);
    const secondSeq = seqFromGraph(graph, pair.second);
    const firstStops = firstSeq.length ? firstSeq : await loadRouteStops(pair.first);
    const secondStops = secondSeq.length ? secondSeq : await loadRouteStops(pair.second);
    const boardIdx = findBoardIdx(firstStops, originStops, seedOriginStops);
    const alightIdx = pair.alight
      ? firstStops.findIndex((row, i) => i >= boardIdx && row.stop === pair.alight.stop)
      : -1;
    const onIdx = pair.pole ? secondStops.findIndex((row) => row.stop === pair.pole.stop) : -1;
    const destIdx = findDestIdx(secondStops, destStops, onIdx);
    if (boardIdx < 0 || alightIdx <= boardIdx || onIdx < 0 || destIdx <= onIdx) continue;
    const first = serviceFromGraphRow(pair.first) || pair.first;
    const second = serviceFromGraphRow(pair.second) || pair.second;
    if (gtfsHasDayService(first, when) === false || gtfsHasDayService(second, when) === false) {
      sawNoService = true;
      continue;
    }
    const wait1 = waitFromHeadway(scheduledHeadwaySec(first, when));
    const wait2 = waitFromHeadway(scheduledHeadwaySec(second, when));
    if (!wait1 || !wait2) {
      sawNoService = true;
      continue;
    }
    const ride1 = await rideEstimate(
      cache,
      firstStops[boardIdx],
      firstStops[alightIdx],
      departAtMs,
      sectionMs(scheduledTripMs(first), boardIdx, alightIdx, firstStops.length),
      opts
    );
    const ride2 = await rideEstimate(
      cache,
      secondStops[onIdx],
      secondStops[destIdx],
      departAtMs,
      sectionMs(scheduledTripMs(second), onIdx, destIdx, secondStops.length),
      opts
    );
    if (!ride1 || !ride2) {
      sawNoDuration = true;
      continue;
    }
    const metres = metresBetween(firstStops[alightIdx], secondStops[onIdx]);
    const xferWalk = metres < 40 ? 0 : Math.max(1, Math.round(walkMs(firstStops[alightIdx], secondStops[onIdx]) / 60000));
    const boardWalkMinutes = walkMinutesTo(firstStops[boardIdx], seedOriginStops);
    const destWalkMinutes = walkMinutesTo(secondStops[destIdx], seedDestStops);
    const walkMinutes = boardWalkMinutes + xferWalk + destWalkMinutes;
    const rideMinutes = (ride1.minutes || 0) + (ride2.minutes || 0);
    const waitMinutes = wait1.minutes + wait2.minutes;
    const doorMinutes = waitMinutes + rideMinutes + walkMinutes;
    const leaveMs = arriveByMs
      ? arriveByMs - destWalkMinutes * 60000 - ride2.ms - wait2.ms - xferWalk * 60000 - ride1.ms - wait1.ms - boardWalkMinutes * 60000
      : null;
    built.push({
      kind: 'transfer',
      catchable: true,
      first,
      second,
      boardStops: [firstStops[boardIdx].stop],
      interchangeStops: [firstStops[alightIdx].stop, secondStops[onIdx].stop],
      destinationStops: destStops.map((row) => row.stop),
      dest: namedDest(second),
      from: namedStop(firstStops[alightIdx]),
      to: namedStop(secondStops[destIdx]),
      fromStop: firstStops[alightIdx].stop,
      toStop: secondStops[destIdx].stop,
      firstOnSeq: boardIdx + 1,
      firstOffSeq: alightIdx + 1,
      secondOnSeq: onIdx + 1,
      secondOffSeq: destIdx + 1,
      walkMinutes,
      boardWalkMinutes,
      destWalkMinutes,
      rideMinutes,
      waitMinutes,
      waitAfterFirstMinutes: wait2.minutes,
      headwayMinutes: wait1.headwayMinutes,
      doorMinutes,
      rideSource: ride1.source === 'tdas' || ride2.source === 'tdas' ? 'tdas' : 'gtfs',
      jam: !!(ride1.jam || ride2.jam),
      leaveHome: leaveMs != null ? clockHkt(leaveMs) : null,
      leaveHomeMs: leaveMs,
      scheduled: true
    });
  }

  const wantFares = opts.fareIndex !== undefined || opts.discountIndex !== undefined || opts.attachFares === true
    || (opts.attachFares !== false && opts.ensureGraph !== false);
  let ranked = wantFares && built.length
    ? await attachJourneyFares(built, { fareIndex: opts.fareIndex, discountIndex: opts.discountIndex })
    : built;
  ranked = sortByStreetCost(ranked, (row) => row.doorMinutes, { travelIncludesDoorWalk: true });
  const streetBest = ranked[0];

  const options = [];
  const seen = new Set();
  for (const row of ranked) {
    const key = [row.kind, serviceUid(row.first), row.second ? serviceUid(row.second) : '', row.fromStop, row.toStop].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const slower = streetBest ? Math.max(0, Math.round((row.doorMinutes || 0) - (streetBest.doorMinutes || 0))) : 0;
    const delta = fareDeltaAgainst(
      { ...row, arrive: new Date(departAtMs + (row.doorMinutes || 0) * 60000).toISOString() },
      streetBest ? { ...streetBest, arrive: new Date(departAtMs + (streetBest.doorMinutes || 0) * 60000).toISOString() } : null
    );
    options.push({
      ...row,
      recommended: options.length === 0,
      slowerByMinutes: slower || null,
      cheaperByHkd: delta.cheaperByHkd,
      cheaperBetter: options.length === 0 && delta.cheaperBetter,
      arrivalEstimated: true
    });
    if (options.length >= 8) break;
  }

  let emptyReason = null;
  if (!options.length) {
    if (sawNoService) emptyReason = 'no_service';
    else if (sawNoDuration) emptyReason = 'no_duration';
    else emptyReason = 'no_connection';
  }

  return {
    options,
    emptyReason,
    date: body?.date || null,
    arriveBy: body?.arriveBy || null,
    observedOnly: false
  };
}
