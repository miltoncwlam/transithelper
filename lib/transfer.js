import { attachDiscounts } from './discounts.js';
import { attachFaresToItems, fareForRoute } from './fares.js';
import { scheduledTripMs } from './gtfs.js';
import { citybusRouteStops, citybusStopEta, stopCompany } from './citybus.js';
import { addStops } from './directory.js';
import { gmbRouteStops, gmbStopEta } from './gmb.js';
import { attachStopMeta, clusterEtas, expandNearby, kmbFetchOrEmpty, namedStop, stopPlaceKey } from './kmb.js';
import { nlbEta, nlbRouteStops } from './nlb.js';
import { etasForStop } from './stopEta.js';
import { lookupStopMap } from './stopName.js';

const ROUTE_STOP_TTL = 24 * 60 * 60 * 1000;
const ETA_TTL = 8 * 1000;
const PLAN_MS = 12000;
const MAX_BACKUPS = 2;

function serviceCompany(row) {
  if (row?.co) return String(row.co).toUpperCase();
  if (row?.gmb_route_id) return 'GMB';
  if (row?.nlb_route_id) return 'NLB';
  return 'KMB';
}

function walkMs(fromStop, toStop) {
  if (!fromStop || !toStop) return 90 * 1000;
  const meters = Math.hypot(
    (Number(fromStop.lat) - Number(toStop.lat)) * 111000,
    (Number(fromStop.long) - Number(toStop.long)) * 102000
  );
  if (!Number.isFinite(meters)) return 90 * 1000;
  return Math.round(Math.max(45 * 1000, (meters / 1.3) * 1000 + 30000));
}

async function routeStops(cache, stopMap, service) {
  const co = serviceCompany(service);
  if (co === 'GMB') {
    const rows = await gmbRouteStops(cache, service);
    addStops(rows);
    return rows;
  }
  if (co === 'NLB') {
    const rows = await nlbRouteStops(cache, service);
    addStops(rows);
    return rows;
  }
  if (co === 'CTB') {
    const rows = await citybusRouteStops(cache, service, stopMap);
    addStops(rows);
    return rows;
  }
  const dir = service.bound === 'O' ? 'outbound' : 'inbound';
  const rows = await kmbFetchOrEmpty(
    `/route-stop/${encodeURIComponent(service.route)}/${dir}/${service.service_type}`,
    cache,
    ROUTE_STOP_TTL
  );
  return attachStopMeta(rows, stopMap);
}

function isFirst(eta, first) {
  const etaCo = serviceCompany(eta);
  const firstCo = serviceCompany(first);
  return first
    && etaCo === firstCo
    && String(eta.route).toUpperCase() === String(first.route).toUpperCase()
    && String(eta.service_type || '1') === String(first.service_type || '1')
    && eta.dir === first.bound
    && (firstCo !== 'GMB' || String(eta.gmb_route_id || first.gmb_route_id || '') === String(first.gmb_route_id || ''))
    && (firstCo !== 'NLB' || String(eta.nlb_route_id || first.nlb_route_id || '') === String(first.nlb_route_id || ''));
}

function metresBetween(a, b) {
  const metres = Math.hypot(
    (Number(a.lat) - Number(b.lat)) * 111000,
    (Number(a.long) - Number(b.long)) * 102000
  );
  return Number.isFinite(metres) ? metres : Infinity;
}

function usableHopMetres(metres) {
  if (!Number.isFinite(metres) || metres <= 0) return 450;
  if (metres > 80000) return 450;
  return metres;
}

function hopTravelMs(metres) {
  const dist = usableHopMetres(metres);
  if (dist >= 2000) return (dist / 12.5) * 1000;
  if (dist >= 800) return (dist / 8.3) * 1000 + 8000;
  return (dist / 4.8) * 1000 + 18000;
}

function maxPlausibleHopMs(metres, expectedMs) {
  const expected = expectedMs || hopTravelMs(metres);
  if (metres >= 2000) return Math.max(expected * 2.5, 15 * 60 * 1000);
  return Math.max(expected * 3, 8 * 60 * 1000);
}

function fasterThanHighwayMs(metres) {
  return (usableHopMetres(metres) / (70 / 3.6)) * 1000;
}

const TDAS_TTL = 15 * 60 * 1000;
const TDAS_URL = 'https://tdas-api.hkemobility.gov.hk/tdas/api/route';

/**
 * TDAS car speed → franchised-bus speed on the same path (km/h).
 *
 * Cars on Tolo / similar highways can show 100–110 km/h. A bus still has
 * on-ramps, off-ramps and a 70 limiter, so the *path average* saturates
 * around 60–65 km/h rather than tracking the car.
 *
 *   v_c ≤ 40:  v_b = 0.90 v_c                         same queue
 *   v_c >  40: v_b = min(63, 36 + 0.77 (v_c − 40))    continuous at 40
 *
 *  v_c=20 → 18;  v_c=75 → 63;  v_c=110 → 63 (not 70+).
 */
function busKmhFromCarKmh(carKmh) {
  const vc = Number(carKmh);
  if (!Number.isFinite(vc) || vc <= 0) return 45;
  if (vc <= 40) return Math.max(8, 0.9 * vc);
  return Math.min(63, 36 + 0.77 * (vc - 40));
}

function tdasResponseMs(json) {
  const distM = Number(json?.distM);
  const speedMatch = /(\d+)/.exec(String(json?.jSpeed || ''));
  const carKmh = speedMatch ? Number(speedMatch[1]) : null;
  if (distM > 0) {
    const busKmh = busKmhFromCarKmh(carKmh);
    return Math.round((distM / (busKmh / 3.6)) * 1000);
  }
  const parts = String(json?.eta || '').split(':').map(Number);
  if (parts.length >= 2 && parts.every(Number.isFinite)) {
    const carMs = ((parts[0] * 60) + parts[1]) * 60 * 1000;
    const busKmh = busKmhFromCarKmh(carKmh);
    const scaleFrom = carKmh > 0 ? carKmh : 45;
    return Math.round(carMs * (scaleFrom / busKmh));
  }
  return null;
}

async function tdasHopMs(cache, fromStop, toStop, departAtMs) {
  const lat1 = Number(fromStop?.lat);
  const lng1 = Number(fromStop?.long);
  const lat2 = Number(toStop?.lat);
  const lng2 = Number(toStop?.long);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const key = `tdas-bus-v4:${fromStop.stop || lat1}:${toStop.stop || lat2}`;
  const cached = cache?.get(key);
  if (cached) return cached;
  const departIn = Math.max(0, Math.round((new Date(departAtMs).getTime() - Date.now()) / 60000 / 15) * 15);
  try {
    const res = await fetch(TDAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'TransitBuddy/1.0' },
      body: JSON.stringify({
        start: { lat: lat1, long: lng1 },
        end: { lat: lat2, long: lng2 },
        departIn
      }),
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const ms = tdasResponseMs(await res.json());
    if (!ms || ms < 60 * 1000) return null;
    return cache ? cache.set(key, ms, TDAS_TTL) : ms;
  } catch {
    return null;
  }
}

function pairAcrossHop(prevSlots, nextSlots, minHopMs) {
  const used = new Set();
  const pairs = [];
  for (const prev of [...(prevSlots || [])].sort((a, b) => a.ms - b.ms)) {
    const hit = (nextSlots || [])
      .filter((slot) => slot.ms >= prev.ms + minHopMs && slot.slot >= prev.slot && !used.has(slot.ms))
      .sort((a, b) => a.ms - b.ms)[0];
    if (hit) {
      used.add(hit.ms);
      pairs.push({ prev, next: hit });
    }
  }
  return pairs;
}

function observedHopMs(prevSlots, nextSlots, minHopMs = 60 * 1000) {
  const hops = pairAcrossHop(prevSlots, nextSlots, minHopMs).map((pair) => pair.next.ms - pair.prev.ms);
  if (!hops.length) return null;
  hops.sort((a, b) => a - b);
  return hops[Math.floor(hops.length / 2)];
}

function alongMetres(seq, fromIdx, toIdx) {
  if (fromIdx < 0 || toIdx <= fromIdx) return 0;
  let metres = 0;
  for (let i = fromIdx; i < toIdx; i += 1) {
    const hop = metresBetween(seq[i], seq[i + 1]);
    metres += usableHopMetres(hop);
  }
  return metres;
}

function routeTravelMs(seq, fromIdx, toIdx, scheduledMs) {
  if (fromIdx < 0 || toIdx <= fromIdx) return 0;
  let hopsMs = 0;
  for (let i = fromIdx; i < toIdx; i += 1) {
    hopsMs += hopTravelMs(metresBetween(seq[i], seq[i + 1]));
  }
  const along = alongMetres(seq, fromIdx, toIdx);
  const full = alongMetres(seq, 0, seq.length - 1);
  if (scheduledMs && full > 0 && along > 0) {
    const scaled = scheduledMs * (along / full);
    return Math.round(Math.max(scaled, hopsMs * 0.75));
  }
  return Math.round(hopsMs);
}

function etaSlotsAt(row, tables) {
  if (!row) return [];
  const raw = tables?.byStop?.size
    ? tables.byStop.get(row.stop)
    : tables?.bySeq?.size
      ? tables.bySeq.get(Number(row.seq))
      : null;
  return (raw || [])
    .map((item, i) => {
      const eta = item?.eta || item;
      const ms = new Date(eta).getTime();
      const slot = Number(item?.eta_seq) || i + 1;
      return { eta, ms, slot };
    })
    .filter((row) => Number.isFinite(row.ms))
    .sort((a, b) => a.slot - b.slot);
}

function sameBound(etaDir, bound) {
  const a = String(etaDir || '').toUpperCase();
  const b = String(bound || '').toUpperCase();
  if (a === b) return true;
  if ((a === 'O' || a === 'OUTBOUND') && (b === 'O' || b === 'OUTBOUND')) return true;
  if ((a === 'I' || a === 'INBOUND') && (b === 'I' || b === 'INBOUND')) return true;
  return false;
}

function slotsFromEtas(etas) {
  return [...etas]
    .filter((eta) => eta?.eta)
    .sort((a, b) => (Number(a.eta_seq) || 0) - (Number(b.eta_seq) || 0) || new Date(a.eta) - new Date(b.eta))
    .map((eta, i) => ({
      eta: eta.eta,
      eta_seq: Number(eta.eta_seq) || i + 1
    }))
    .slice(0, 3);
}

async function firstRouteEtaTables(cache, first, seq, fromIdx, toIdx) {
  const empty = { bySeq: new Map(), byStop: new Map() };
  if (!first?.route || fromIdx < 0 || toIdx < fromIdx || !seq.length) return empty;
  const firstCo = serviceCompany(first);
  if (firstCo === 'GMB' || firstCo === 'CTB' || firstCo === 'NLB') {
    const slice = seq.slice(fromIdx, toIdx + 1);
    const lists = await mapPool(slice, 6, (row) => {
      if (firstCo === 'GMB') return gmbStopEta(cache, row, first);
      if (firstCo === 'NLB') return nlbEta(cache, row, first);
      return citybusStopEta(cache, row.stop, first.route);
    });
    const byStop = new Map();
    slice.forEach((row, i) => {
      const matched = (lists[i] || []).filter((eta) => {
        if (!eta.eta) return false;
        if (firstCo === 'GMB') {
          return !eta.route || String(eta.route).toUpperCase() === String(first.route).toUpperCase();
        }
        if (firstCo === 'NLB') {
          return !eta.nlb_route_id || String(eta.nlb_route_id) === String(first.nlb_route_id);
        }
        return sameBound(eta.dir, first.bound);
      });
      byStop.set(row.stop, slotsFromEtas(matched));
    });
    return { bySeq: new Map(), byStop };
  }
  const rows = await kmbFetchOrEmpty(
    `/route-eta/${encodeURIComponent(first.route)}/${first.service_type || '1'}`,
    cache,
    ETA_TTL
  );
  const grouped = new Map();
  for (const eta of rows || []) {
    if (!eta.eta || !isFirst(eta, first)) continue;
    const seqNo = Number(eta.seq);
    if (!grouped.has(seqNo)) grouped.set(seqNo, []);
    grouped.get(seqNo).push(eta);
  }
  const bySeq = new Map();
  for (const [seqNo, list] of grouped) bySeq.set(seqNo, slotsFromEtas(list));
  return { bySeq, byStop: new Map() };
}

function followStop(row, ms, estimated) {
  return {
    stop: row?.stop || null,
    name: namedStop(row),
    time: new Date(ms).toISOString(),
    estimated: !!estimated
  };
}

async function followBusAlongRoute(seq, fromIdx, toIdx, tables, startIso, cache) {
  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs) || fromIdx < 0 || toIdx < fromIdx) {
    return { time: null, estimated: true, stops: [] };
  }

  const boardSlots = etaSlotsAt(seq[fromIdx], tables);
  const boardHit = boardSlots.find((slot) => Math.abs(slot.ms - startMs) <= 90 * 1000) || boardSlots[0];
  let prevMs = boardHit?.ms ?? startMs;
  let lastSlot = boardHit?.slot || 1;
  let estimated = false;
  const stops = [followStop(seq[fromIdx], prevMs, false)];

  if (toIdx === fromIdx) {
    return { time: new Date(prevMs).toISOString(), estimated: false, stops };
  }

  for (let i = fromIdx + 1; i <= toIdx; i += 1) {
    const prevSlots = etaSlotsAt(seq[i - 1], tables);
    const slots = etaSlotsAt(seq[i], tables);
    const metres = usableHopMetres(metresBetween(seq[i - 1], seq[i]));
    const longHop = metres >= 2000;
    let expectedMs = hopTravelMs(metres);
    if (longHop) {
      const tdas = await tdasHopMs(cache, seq[i - 1], seq[i], prevMs);
      if (tdas) expectedMs = tdas;
    }
    const minHop = longHop ? fasterThanHighwayMs(metres) : 0;
    const cap = maxPlausibleHopMs(metres, expectedMs);
    let hopEstimated = false;

    if (longHop) {
      const pairs = pairAcrossHop(prevSlots, slots, minHop);
      const mine = pairs.find((pair) => (
        Math.abs(pair.prev.ms - prevMs) <= 90 * 1000
        && pair.next.ms - prevMs <= cap
      ));
      if (mine) {
        prevMs = mine.next.ms;
        lastSlot = Math.max(lastSlot, mine.next.slot);
      } else {
        hopEstimated = true;
        estimated = true;
        prevMs += Math.max(expectedMs, 60 * 1000);
      }
    } else {
      const live = slots
        .filter((slot) => slot.ms >= prevMs + minHop && slot.slot >= lastSlot && slot.ms - prevMs <= cap)
        .sort((a, b) => a.ms - b.ms)[0];
      if (live) {
        prevMs = live.ms;
        lastSlot = live.slot;
      } else {
        hopEstimated = true;
        estimated = true;
        const observed = observedHopMs(prevSlots, slots);
        prevMs += Math.max((observed && observed <= cap ? observed : expectedMs), 60 * 1000);
      }
    }
    stops.push(followStop(seq[i], prevMs, hopEstimated));
  }

  return { time: new Date(prevMs).toISOString(), estimated, stops };
}

async function attachRideTimes(cache, service, seq, item, fromIdx, toIdx) {
  if (!seq?.length || fromIdx < 0 || toIdx < fromIdx) return item;
  const tables = await firstRouteEtaTables(cache, service, seq, fromIdx, toIdx);
  const followed = await followBusAlongRoute(seq, fromIdx, toIdx, tables, item.eta, cache);
  if (!followed.time) return item;
  const start = new Date(item.eta).getTime();
  const end = new Date(followed.time).getTime();
  return {
    ...item,
    arrive: followed.time,
    arrivalEstimated: followed.estimated,
    rideMinutes: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 60000)) : item.rideMinutes,
    stops: followed.stops || []
  };
}

function matchesDest(row, destStops, destIds) {
  if (destIds.has(row.stop)) return true;
  return destStops.some((dest) => {
    if (dest.stop === row.stop) return true;
    const metres = metresBetween(row, dest);
    if (metres <= 80) return true;
    return metres <= 120 && stopPlaceKey(row) === stopPlaceKey(dest);
  });
}

function servesAfter(seq, fromId, destStops, destIds) {
  const fromIdx = seq.findIndex((row) => row.stop === fromId);
  if (fromIdx < 0) return null;
  const toIdx = seq.findIndex((row, i) => i > fromIdx && matchesDest(row, destStops, destIds));
  if (toIdx < 0) return null;
  return { from: seq[fromIdx], to: seq[toIdx] };
}

function namedDest(eta) {
  return {
    zh: eta.dest_tc || eta.dest_en || '',
    en: eta.dest_en || eta.dest_tc || ''
  };
}

function emptyPlan(emptyReason, extra = {}) {
  return {
    phase: extra.phase || null,
    firstArrivalAtInterchange: extra.firstArrivalAtInterchange || null,
    firstStops: extra.firstStops || [],
    boardDeparture: extra.boardDeparture || null,
    arrivalEstimated: extra.arrivalEstimated || false,
    sameStartAndTransfer: extra.sameStartAndTransfer || false,
    departures: extra.departures || [],
    directs: extra.directs || [],
    list: extra.list || [],
    watch: extra.watch || null,
    emptyReason
  };
}

async function etasAtStops(cache, stops, routes) {
  const lists = await mapPool(stops, 8, (stop) => etasForStop(cache, stop, routes));
  const rows = [];
  stops.forEach((stop, i) => {
    for (const eta of lists[i] || []) {
      if (!eta.eta) continue;
      rows.push({ eta: { ...eta, co: eta.co || stopCompany(stop) }, stop });
    }
  });
  return rows;
}

function enrichEta(eta, routes) {
  if ((eta.co || 'KMB') !== 'CTB') return eta;
  const hit = (routes || []).find((r) =>
    r.co === 'CTB'
    && String(r.route).toUpperCase() === String(eta.route).toUpperCase()
    && r.bound === eta.dir
  );
  if (!hit) return eta;
  const hasZh = /[\u4e00-\u9fff]/.test(eta.dest_tc || '');
  return {
    ...eta,
    dest_tc: hasZh ? eta.dest_tc : (hit.dest_tc || eta.dest_tc || ''),
    dest_en: eta.dest_en || hit.dest_en || ''
  };
}

function groupCandidates(live) {
  const candidates = new Map();
  for (const row of live) {
    const co = row.eta.co || stopCompany(row.stop);
    const key = co === 'GMB'
      ? ['GMB', row.eta.gmb_route_id || row.eta.route, row.eta.gmb_route_seq || row.eta.dir].join('|')
      : co === 'NLB'
        ? ['NLB', row.eta.nlb_route_id || row.eta.route].join('|')
        : [co, row.eta.route, row.eta.dir, row.eta.service_type || '1'].join('|');
    if (!candidates.has(key)) {
      candidates.set(key, {
        co,
        route: row.eta.route,
        bound: row.eta.dir || 'O',
        service_type: row.eta.service_type || '1',
        gmb_route_id: row.eta.gmb_route_id,
        gmb_route_seq: row.eta.gmb_route_seq,
        nlb_route_id: row.eta.nlb_route_id,
        orig_tc: row.eta.orig_tc,
        dest_tc: row.eta.dest_tc,
        orig_en: row.eta.orig_en,
        dest_en: row.eta.dest_en,
        entries: []
      });
    }
    candidates.get(key).entries.push(row);
  }
  return [...candidates.values()];
}

const BBI_POLE_METRES = 80;

function poleMetres(a, b) {
  const lat1 = Number(a.fromLat);
  const lng1 = Number(a.fromLng);
  const lat2 = Number(b.fromLat);
  const lng2 = Number(b.fromLng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;
  return Math.hypot((lat1 - lat2) * 111000, (lng1 - lng2) * 102000);
}

function isAlightPole(item, firstAlightIds) {
  const name = `${item.from?.zh || ''} ${item.from?.en || ''}`;
  if (/落客|alighting/i.test(name)) return true;
  return firstAlightIds.has(item.fromStop);
}

function preferBoardPole(next, prev, firstAlightIds) {
  const nextAlight = isAlightPole(next, firstAlightIds);
  const prevAlight = isAlightPole(prev, firstAlightIds);
  if (nextAlight !== prevAlight) return prevAlight;
  const nextSeq = Number(next.fromSeq);
  const prevSeq = Number(prev.fromSeq);
  if (Number.isFinite(nextSeq) && Number.isFinite(prevSeq) && nextSeq !== prevSeq) {
    return nextSeq > prevSeq;
  }
  return false;
}

function sameBbiTrip(row, item) {
  return row.kind === item.kind
    && (row.co || 'KMB') === (item.co || 'KMB')
    && row.route === item.route
    && stopPlaceKey(row.from) === stopPlaceKey(item.from)
    && stopPlaceKey(row.to) === stopPlaceKey(item.to)
    && stopPlaceKey(row.dest) === stopPlaceKey(item.dest)
    && Math.abs(new Date(row.eta) - new Date(item.eta)) < 180000
    && poleMetres(row, item) <= BBI_POLE_METRES;
}

function addUnique(list, item, firstAlightIds = new Set()) {
  const idx = list.findIndex((row) => sameBbiTrip(row, item));
  if (idx < 0) {
    list.push(item);
    return;
  }
  if (preferBoardPole(item, list[idx], firstAlightIds)) list[idx] = item;
}

function publicItem(item) {
  const { fromLat, fromLng, ...rest } = item;
  return rest;
}

function connectionWatchKey(item) {
  return [
    item?.co || 'KMB',
    String(item?.route || '').toUpperCase(),
    item?.kind || 'transfer',
    stopPlaceKey(item?.dest),
    stopPlaceKey(item?.from)
  ].join('|');
}

function watchConnection(all, selected, firstArrival) {
  if (!selected?.route) return null;
  const key = connectionWatchKey(selected);
  const liveMatches = (all || [])
    .filter((row) => connectionWatchKey(row) === key)
    .sort((a, b) => new Date(a.eta) - new Date(b.eta));
  const live = liveMatches[0] || null;
  const arriveMs = firstArrival ? new Date(firstArrival).getTime() : null;
  const liveMs = live ? new Date(live.eta).getTime() : NaN;
  const catchable = Number.isFinite(liveMs) && (arriveMs == null || liveMs >= arriveMs);
  const selectedMs = Number.isFinite(liveMs) ? liveMs : new Date(selected.eta).getTime();
  const earlier = (all || [])
    .filter((row) => {
      const etaMs = new Date(row.eta).getTime();
      if (!Number.isFinite(etaMs) || !Number.isFinite(selectedMs)) return false;
      if (arriveMs != null && etaMs < arriveMs) return false;
      if (connectionWatchKey(row) === key && Math.abs(etaMs - selectedMs) < 45000) return false;
      return etaMs < selectedMs - 30000;
    })
    .sort((a, b) => new Date(a.eta) - new Date(b.eta))[0] || null;
  return {
    catchable,
    missed: !catchable,
    selected: live,
    earlier
  };
}

function connectionRow(kind, candidate, entry, match, extra = {}) {
  return {
    kind,
    co: serviceCompany({ ...candidate, co: candidate.co || entry.eta?.co }),
    route: candidate.route,
    bound: candidate.bound,
    service_type: candidate.service_type,
    gmb_route_id: candidate.gmb_route_id,
    gmb_route_seq: candidate.gmb_route_seq,
    nlb_route_id: candidate.nlb_route_id,
    on_seq: Number(match.from?.seq) || null,
    off_seq: Number(match.to?.seq) || null,
    eta: entry.eta.eta,
    dest: namedDest(entry.eta),
    from: namedStop(match.from),
    to: namedStop(match.to),
    fromStop: match.from.stop,
    fromSeq: match.from.seq,
    toStop: match.to.stop,
    toSeq: match.to.seq,
    fromLat: match.from.lat,
    fromLng: match.from.long,
    ...extra
  };
}

function isFirstRoute(candidate, first) {
  return first
    && serviceCompany(candidate) === serviceCompany(first)
    && String(candidate.route).toUpperCase() === String(first.route).toUpperCase()
    && candidate.bound === first.bound
    && String(candidate.service_type) === String(first.service_type)
    && (serviceCompany(first) !== 'GMB' || String(candidate.gmb_route_id || '') === String(first.gmb_route_id || ''))
    && (serviceCompany(first) !== 'NLB' || String(candidate.nlb_route_id || '') === String(first.nlb_route_id || ''));
}

function resolvePhase(body) {
  if (body.phase === 'departures' || body.phase === 'connections') return body.phase;
  if (body.selectedDeparture) return 'connections';
  return 'departures';
}

function pickConnections(items) {
  const ranked = [...items].sort((a, b) => {
    const dt = new Date(a.eta) - new Date(b.eta);
    if (dt) return dt;
    if (a.kind === 'stay' && b.kind !== 'stay') return -1;
    if (b.kind === 'stay' && a.kind !== 'stay') return 1;
    return 0;
  });
  const chosen = ranked.slice(0, 1 + MAX_BACKUPS).map((item, i) => ({
    ...item,
    recommended: i === 0
  }));
  return chosen;
}

async function plan(cache, stopMap, allStops, body, routes) {
  const radius = Number(body.radius) || 250;
  const first = body.first;
  const phase = resolvePhase(body);
  const interchangeSeeds = (body.interchangeStops || []).map((id) => lookupStopMap(stopMap, id)).filter(Boolean);
  const destSeeds = (body.destinationStops || []).map((id) => lookupStopMap(stopMap, id)).filter(Boolean);
  const boardSeeds = (body.boardStops || []).map((id) => lookupStopMap(stopMap, id)).filter(Boolean);
  if (!interchangeSeeds.length || !destSeeds.length) {
    return emptyPlan('incomplete', { phase });
  }
  if (!boardSeeds.length) {
    return emptyPlan('need_board', { phase });
  }

  const interchange = body.nearby ? expandNearby(interchangeSeeds, allStops, radius) : interchangeSeeds;
  const destinations = body.nearby ? expandNearby(destSeeds, allStops, radius) : destSeeds;
  const boarding = boardSeeds.length
    ? (body.nearby ? expandNearby(boardSeeds, allStops, radius) : boardSeeds)
    : [];
  const destIds = new Set(destinations.map((stop) => stop.stop));
  const boardIds = new Set(boarding.map((stop) => stop.stop));
  const interIds = new Set(interchange.map((stop) => stop.stop));
  const sameStartAndTransfer = [...boardIds].some((id) => interIds.has(id));

  const firstSeq = first ? await routeStops(cache, stopMap, first) : [];
  const boardIdx = firstSeq.findIndex((row) => boardIds.has(row.stop));
  const interIdx = firstSeq.findIndex((row) => interIds.has(row.stop));
  if (boardIdx >= 0 && interIdx >= 0 && interIdx < boardIdx) {
    return emptyPlan('incomplete', { phase });
  }
  const destOnFirst = firstSeq.findIndex((row, i) => i > Math.max(interIdx, boardIdx, 0) && matchesDest(row, destinations, destIds));
  const travelMs = routeTravelMs(firstSeq, boardIdx, interIdx, scheduledTripMs(first));
  const alightStop = interIdx >= 0 ? firstSeq[interIdx] : interchangeSeeds[0];
  const firstAlightIds = new Set(alightStop?.stop ? [alightStop.stop] : []);

  const lookupStops = new Map();
  const liveStops = phase === 'departures' ? boarding : interchange;
  for (const stop of liveStops) lookupStops.set(stop.stop, stop);
  const needChain = first && boardIdx >= 0 && interIdx >= boardIdx;
  const [live, etaTables] = await Promise.all([
    etasAtStops(cache, [...lookupStops.values()], routes),
    needChain
      ? firstRouteEtaTables(cache, first, firstSeq, boardIdx, interIdx)
      : Promise.resolve({ bySeq: new Map(), byStop: new Map() })
  ]);

  const boardFirstTimes = clusterEtas(
    live.filter(({ eta, stop }) => isFirst(eta, first) && boardIds.has(stop.stop)).map(({ eta }) => eta.eta)
  );

  const candidateList = groupCandidates(live);
  const sequences = await mapPool(candidateList, 6, (candidate) => routeStops(cache, stopMap, candidate));

  if (phase === 'departures') {
    const dest = first ? namedDest({ dest_tc: first.dest_tc, dest_en: first.dest_en }) : { zh: '', en: '' };
    const departureSource = boardFirstTimes.slice(0, 8);
    const departures = await mapPool(departureSource, 4, async (eta) => {
      const row = { eta, dest, route: first?.route || '', board: eta };
      if (!(boardIdx >= 0 && interIdx >= boardIdx && etaTables)) return row;
      const followed = await followBusAlongRoute(firstSeq, boardIdx, interIdx, etaTables, eta, cache);
      if (!followed.time) return row;
      return {
        ...row,
        arrive: followed.time,
        arrivalEstimated: followed.estimated,
        rideMinutes: Math.max(0, Math.round((new Date(followed.time) - new Date(eta)) / 60000)),
        stops: followed.stops || []
      };
    });
    const pending = [];
    candidateList.forEach((candidate, idx) => {
      const seq = sequences[idx] || [];
      if (!seq.length || isFirstRoute(candidate, first)) return;
      for (const entry of candidate.entries) {
        const match = servesAfter(seq, entry.stop.stop, destinations, destIds);
        if (!match) continue;
        const fromIdx = seq.findIndex((row) => row.stop === match.from.stop);
        const toIdx = seq.findIndex((row) => row.stop === match.to.stop);
        if (fromIdx < 0 || toIdx <= fromIdx) continue;
        const atBoard = boardIds.has(entry.stop.stop);
        const atInter = interIds.has(entry.stop.stop);
        const sameStop = atBoard && atInter;
        let kind = null;
        if (sameStop || (sameStartAndTransfer && atInter)) kind = 'same_stop';
        else if (atBoard && !atInter) kind = 'direct';
        if (!kind) continue;
        pending.push({
          candidate,
          seq,
          fromIdx,
          toIdx,
          item: connectionRow(kind, candidate, entry, match, { waitAfterFirstMinutes: null })
        });
      }
    });
    const uniqueDirects = [];
    for (const row of pending) addUnique(uniqueDirects, row.item, firstAlightIds);
    const timedDirects = await mapPool(uniqueDirects.slice(0, 10), 3, async (item) => {
      const hit = pending.find((row) => row.item.route === item.route && row.item.kind === item.kind && row.item.eta === item.eta);
      if (!hit) return item;
      return attachRideTimes(cache, hit.candidate, hit.seq, item, hit.fromIdx, hit.toIdx);
    });
    timedDirects.sort((a, b) => new Date(a.eta) - new Date(b.eta));
    const withDiscounts = first ? await attachDiscounts(timedDirects.map(publicItem), first) : timedDirects.map(publicItem);
    return {
      phase: 'departures',
      firstArrivalAtInterchange: departures.find((row) => row.arrive)?.arrive || null,
      firstFare: boardIdx >= 0 && interIdx > boardIdx
        ? await fareForRoute(first, boardIdx + 1, interIdx + 1)
        : await fareForRoute(first),
      boardDeparture: departures[0]?.eta || null,
      arrivalEstimated: !!departures.find((row) => row.arrivalEstimated),
      sameStartAndTransfer,
      departures,
      directs: await attachFaresToItems(withDiscounts),
      list: [],
      emptyReason: departures.length ? null : 'no_departure'
    };
  }

  const boardDeparture = body.selectedDeparture || boardFirstTimes[0] || null;
  let firstArrivalAtInterchange = null;
  let arrivalEstimated = false;
  let firstStops = [];
  if (boardDeparture && boardIdx >= 0 && interIdx >= boardIdx) {
    const followed = await followBusAlongRoute(
      firstSeq,
      boardIdx,
      interIdx,
      etaTables,
      boardDeparture,
      cache
    );
    firstArrivalAtInterchange = followed.time;
    arrivalEstimated = followed.estimated;
    firstStops = followed.stops || [];
  } else if (boardDeparture && travelMs) {
    firstArrivalAtInterchange = new Date(new Date(boardDeparture).getTime() + travelMs).toISOString();
    arrivalEstimated = true;
  }

  const connectAfterBase = firstArrivalAtInterchange
    ? new Date(firstArrivalAtInterchange).getTime()
    : null;

  const list = [];
  if (first && firstArrivalAtInterchange && destOnFirst > interIdx && interIdx >= 0) {
    addUnique(list, {
      kind: 'stay',
      co: serviceCompany(first),
      route: first.route,
      bound: first.bound,
      service_type: first.service_type,
      gmb_route_id: first.gmb_route_id,
      gmb_route_seq: first.gmb_route_seq,
      on_seq: interIdx + 1,
      off_seq: destOnFirst + 1,
      eta: firstArrivalAtInterchange,
      dest: namedDest({ dest_tc: first.dest_tc, dest_en: first.dest_en }),
      from: namedStop(firstSeq[interIdx]),
      to: namedStop(firstSeq[destOnFirst]),
      waitAfterFirstMinutes: 0,
      fromStop: firstSeq[interIdx]?.stop,
      toStop: firstSeq[destOnFirst]?.stop
    }, firstAlightIds);
  }

  candidateList.forEach((candidate, idx) => {
    const seq = sequences[idx] || [];
    if (!seq.length) return;
    for (const entry of candidate.entries) {
      const match = servesAfter(seq, entry.stop.stop, destinations, destIds);
      if (!match) continue;
      const etaMs = new Date(entry.eta.eta).getTime();
      const atInter = interIds.has(entry.stop.stop);
      const firstMatch = isFirstRoute(candidate, first);
      if (!atInter || firstMatch) continue;
      const walk = walkMs(alightStop, entry.stop);
      if (connectAfterBase && etaMs < connectAfterBase + walk) continue;
      addUnique(list, connectionRow('transfer', candidate, entry, match, {
        waitAfterFirstMinutes: firstArrivalAtInterchange
          ? Math.max(0, Math.round((etaMs - new Date(firstArrivalAtInterchange).getTime()) / 60000))
          : null
      }), firstAlightIds);
    }
  });

  const timedList = await mapPool(list.slice(0, 12), 3, async (item) => {
    let seq = firstSeq;
    let service = first;
    if (item.kind !== 'stay') {
      const idx = candidateList.findIndex((candidate) => (
        String(candidate.route).toUpperCase() === String(item.route).toUpperCase()
        && serviceCompany(candidate) === serviceCompany(item)
      ));
      if (idx >= 0) {
        seq = sequences[idx] || [];
        service = candidateList[idx];
      }
    }
    const fromIdx = seq.findIndex((row) => row.stop === item.fromStop);
    const toIdx = seq.findIndex((row) => row.stop === item.toStop);
    const timed = await attachRideTimes(cache, service, seq, item, fromIdx, toIdx);
    if (timed.arrive && boardDeparture) {
      const total = Math.round((new Date(timed.arrive) - new Date(boardDeparture)) / 60000);
      if (Number.isFinite(total) && total >= 0) timed.totalMinutes = total;
    }
    return timed;
  });

  const allPublic = timedList.map(publicItem);
  const ranked = pickConnections(timedList).map(publicItem);
  const watch = watchConnection(allPublic, body.selectedConnection, firstArrivalAtInterchange);
  if (watch?.selected && !ranked.some((row) => connectionWatchKey(row) === connectionWatchKey(watch.selected)
    && Math.abs(new Date(row.eta) - new Date(watch.selected.eta)) < 60000)) {
    ranked.push(watch.selected);
  }
  const withDiscounts = first ? await attachDiscounts(ranked, first) : ranked;
  const withFares = await attachFaresToItems(withDiscounts);
  if (watch?.selected) {
    const watchRows = [watch.selected, watch.earlier].filter(Boolean);
    const paid = await attachFaresToItems(first ? await attachDiscounts(watchRows, first) : watchRows);
    watch.selected = paid[0];
    if (watch.earlier && paid[1]) watch.earlier = paid[1];
  }

  let emptyReason = null;
  if (!withFares.length) {
    if (!firstArrivalAtInterchange) emptyReason = 'no_first_bus';
    else emptyReason = 'no_connection';
  }

  return {
    phase: 'connections',
    firstArrivalAtInterchange,
    firstFare: first && boardIdx >= 0 && interIdx > boardIdx
      ? await fareForRoute(first, boardIdx + 1, interIdx + 1)
      : first ? await fareForRoute(first) : null,
    firstStops,
    boardDeparture,
    arrivalEstimated,
    sameStartAndTransfer,
    departures: [],
    directs: [],
    list: withFares,
    watch,
    emptyReason
  };
}

function serviceKey(service) {
  return [
    serviceCompany(service),
    String(service?.route || '').toUpperCase(),
    service?.bound || '',
    String(service?.service_type || '1'),
    service?.gmb_route_id || '',
    service?.gmb_route_seq || '',
    service?.nlb_route_id || ''
  ].join('|');
}

async function predictOneService(cache, stopMap, first, boardIds, destIds) {
  const seq = await routeStops(cache, stopMap, first);
  const boardIdx = seq.findIndex((row) => boardIds.has(row.stop));
  if (boardIdx < 0) return { trips: [], emptyReason: 'empty' };
  const destStops = [...destIds].map((id) => stopMap.get(id) || seq.find((row) => row.stop === id)).filter(Boolean);
  const destIdx = destStops.length
    ? seq.findIndex((row, i) => i > boardIdx && matchesDest(row, destStops, destIds))
    : -1;
  if (destIds.size && destIdx < 0) return { trips: [], emptyReason: 'no_dest' };

  const toIdx = destIdx >= 0 ? destIdx : (destIds.size ? -1 : seq.length - 1);
  if (toIdx < boardIdx) return { trips: [], emptyReason: 'empty' };
  const tables = await firstRouteEtaTables(cache, first, seq, boardIdx, toIdx);
  const boardSlots = etaSlotsAt(seq[boardIdx], tables);
  if (!boardSlots.length) return { trips: [], emptyReason: 'empty' };
  const meta = {
    route: first.route,
    co: serviceCompany(first),
    dest: namedDest(first),
    bound: first.bound,
    service_type: first.service_type,
    gmb_route_id: first.gmb_route_id,
    gmb_route_seq: first.gmb_route_seq,
    on_seq: boardIdx + 1,
    off_seq: toIdx > boardIdx ? toIdx + 1 : null
  };
  if (toIdx === boardIdx) {
    return {
      trips: boardSlots.map((slot) => ({
        ...meta,
        board: slot.eta,
        arrive: slot.eta,
        arrivalEstimated: false,
        rideMinutes: 0,
        stops: [followStop(seq[boardIdx], new Date(slot.eta).getTime(), false)]
      })),
      emptyReason: null
    };
  }

  const trips = [];
  for (const slot of boardSlots) {
    const followed = await followBusAlongRoute(seq, boardIdx, toIdx, tables, slot.eta, cache);
    if (!followed.time) continue;
    trips.push({
      ...meta,
      board: slot.eta,
      arrive: followed.time,
      arrivalEstimated: followed.estimated,
      rideMinutes: Math.max(0, Math.round((new Date(followed.time) - new Date(slot.eta)) / 60000)),
      stops: followed.stops || []
    });
  }
  return { trips, emptyReason: trips.length ? null : 'empty' };
}

export async function predictRide(cache, stopMap, body, routes = []) {
  const first = body?.first;
  const boardIds = new Set(body?.boardStops || []);
  const destIds = new Set(body?.destStops || []);
  if (!first?.route || !boardIds.size) {
    return { trips: [], emptyReason: 'incomplete' };
  }
  const siblings = destIds.size
    ? (routes || []).filter((row) => (
      String(row.route).toUpperCase() === String(first.route).toUpperCase()
      && serviceCompany(row) === serviceCompany(first)
      && (serviceCompany(first) !== 'GMB' || String(row.gmb_route_id) === String(first.gmb_route_id))
      && (serviceCompany(first) !== 'NLB' || String(row.nlb_route_id) === String(first.nlb_route_id))
    ))
    : [];
  const seen = new Set();
  const candidates = [];
  for (const service of [first, ...siblings]) {
    const key = serviceKey(service);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(service);
  }
  const parts = await mapPool(candidates.slice(0, 6), 3, (service) => (
    predictOneService(cache, stopMap, service, boardIds, destIds)
  ));
  const trips = parts
    .flatMap((part) => part.trips || [])
    .sort((a, b) => new Date(a.arrive || a.board) - new Date(b.arrive || b.board));
  const paid = await attachFaresToItems(trips);
  return { trips: paid, emptyReason: paid.length ? null : (parts.find((part) => part.emptyReason)?.emptyReason || 'empty') };
}

export async function planTransfer(cache, stopMap, allStops, body, routes) {
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(emptyPlan('timeout', { phase: resolvePhase(body || {}) })), PLAN_MS);
  });
  try {
    return await Promise.race([plan(cache, stopMap, allStops, body, routes), timeout]);
  } catch {
    return emptyPlan('none', { phase: resolvePhase(body || {}) });
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, worker));
  return out;
}
