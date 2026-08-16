import { attachDiscounts } from './discounts.js';
import { attachStopMeta, clusterEtas, expandNearby, kmbFetchOrEmpty, namedStop } from './kmb.js';

const ROUTE_STOP_TTL = 24 * 60 * 60 * 1000;
const ETA_TTL = 8 * 1000;
const PLAN_MS = 12000;

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
  const dir = service.bound === 'O' ? 'outbound' : 'inbound';
  const rows = await kmbFetchOrEmpty(
    `/route-stop/${encodeURIComponent(service.route)}/${dir}/${service.service_type}`,
    cache,
    ROUTE_STOP_TTL
  );
  return attachStopMeta(rows, stopMap);
}

function isFirst(eta, first) {
  return first
    && String(eta.route).toUpperCase() === String(first.route).toUpperCase()
    && String(eta.service_type) === String(first.service_type)
    && eta.dir === first.bound;
}

function servesAfter(seq, fromId, destIds) {
  const fromIdx = seq.findIndex((row) => row.stop === fromId);
  if (fromIdx < 0) return null;
  const toIdx = seq.findIndex((row, i) => i > fromIdx && destIds.has(row.stop));
  if (toIdx < 0) return null;
  return { from: seq[fromIdx], to: seq[toIdx] };
}

function namedDest(eta) {
  return {
    zh: eta.dest_tc || eta.dest_en || '',
    en: eta.dest_en || eta.dest_tc || ''
  };
}

async function etasAtStops(cache, stops) {
  const lists = await mapPool(stops, 8, (stop) =>
    kmbFetchOrEmpty(`/stop-eta/${encodeURIComponent(stop.stop)}`, cache, ETA_TTL)
  );
  const rows = [];
  stops.forEach((stop, i) => {
    for (const eta of lists[i] || []) {
      if (!eta.eta) continue;
      rows.push({ eta, stop });
    }
  });
  return rows;
}

async function plan(cache, stopMap, allStops, body) {
  const radius = Number(body.radius) || 250;
  const first = body.first;
  const interchangeSeeds = (body.interchangeStops || []).map((id) => stopMap.get(id)).filter(Boolean);
  const destSeeds = (body.destinationStops || []).map((id) => stopMap.get(id)).filter(Boolean);
  const boardSeeds = (body.boardStops || []).map((id) => stopMap.get(id)).filter(Boolean);
  if (!interchangeSeeds.length || !destSeeds.length) {
    return { firstArrivalAtInterchange: null, boardDeparture: null, list: [], emptyReason: 'incomplete' };
  }
  if (body.state === 'wait' && !boardSeeds.length) {
    return { firstArrivalAtInterchange: null, boardDeparture: null, list: [], emptyReason: 'need_board' };
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
  const destOnFirst = firstSeq.findIndex((row, i) => i > Math.max(interIdx, boardIdx, 0) && destIds.has(row.stop));
  const travelMs = boardIdx >= 0 && interIdx > boardIdx ? (interIdx - boardIdx) * 50 * 1000 : 0;

  const lookupStops = new Map();
  for (const stop of [...boarding, ...interchange]) lookupStops.set(stop.stop, stop);
  const live = await etasAtStops(cache, [...lookupStops.values()]);

  const boardFirstTimes = clusterEtas(
    live.filter(({ eta, stop }) => isFirst(eta, first) && boardIds.has(stop.stop)).map(({ eta }) => eta.eta)
  );
  const interFirstTimes = clusterEtas(
    live.filter(({ eta, stop }) => isFirst(eta, first) && interIds.has(stop.stop)).map(({ eta }) => eta.eta)
  );

  let boardDeparture = boardFirstTimes[0] || null;
  let firstArrivalAtInterchange = interFirstTimes[0] || null;
  if (body.state === 'wait' && boardDeparture) {
    const estimated = new Date(new Date(boardDeparture).getTime() + travelMs);
    const matched = interFirstTimes.find((time) => new Date(time) >= new Date(new Date(boardDeparture).getTime() + travelMs * 0.55));
    firstArrivalAtInterchange = matched || (travelMs ? estimated.toISOString() : firstArrivalAtInterchange);
  }

  const connectAfterBase = firstArrivalAtInterchange
    ? new Date(firstArrivalAtInterchange).getTime()
    : null;

  const candidates = new Map();
  for (const row of live) {
    const key = [row.eta.route, row.eta.dir, row.eta.service_type].join('|');
    if (!candidates.has(key)) {
      candidates.set(key, {
        route: row.eta.route,
        bound: row.eta.dir,
        service_type: row.eta.service_type,
        entries: []
      });
    }
    candidates.get(key).entries.push(row);
  }

  const candidateList = [...candidates.values()];
  const sequences = await mapPool(candidateList, 6, (candidate) => routeStops(cache, stopMap, candidate));

  const list = [];
  function add(item) {
    const dup = list.find((row) =>
      row.kind === item.kind
      && row.route === item.route
      && row.from.zh === item.from.zh
      && row.to.zh === item.to.zh
      && Math.abs(new Date(row.eta) - new Date(item.eta)) < 90000
    );
    if (dup) return;
    list.push(item);
  }

  if (first && firstArrivalAtInterchange && destOnFirst > interIdx && interIdx >= 0) {
    add({
      kind: 'stay',
      route: first.route,
      eta: firstArrivalAtInterchange,
      dest: namedDest({ dest_tc: first.dest_tc, dest_en: first.dest_en }),
      from: namedStop(firstSeq[interIdx]),
      to: namedStop(firstSeq[destOnFirst]),
      waitAfterFirstMinutes: 0
    });
  }

  candidateList.forEach((candidate, idx) => {
    const seq = sequences[idx] || [];
    if (!seq.length) return;
    for (const entry of candidate.entries) {
      const match = servesAfter(seq, entry.stop.stop, destIds);
      if (!match) continue;
      const etaMs = new Date(entry.eta.eta).getTime();
      const atBoard = boardIds.has(entry.stop.stop);
      const atInter = interIds.has(entry.stop.stop);
      const sameStop = atBoard && atInter;
      const isFirstRoute = first
        && String(candidate.route).toUpperCase() === String(first.route).toUpperCase()
        && candidate.bound === first.bound
        && String(candidate.service_type) === String(first.service_type);

      let kind = null;
      if (sameStop || (sameStartAndTransfer && atInter)) kind = 'same_stop';
      else if (atBoard && !atInter) kind = 'direct';
      else if (atInter) kind = 'transfer';
      if (!kind) continue;

      if (kind === 'transfer' && isFirstRoute) continue;
      if (kind === 'same_stop' && isFirstRoute) continue;
      const walk = walkMs(interchangeSeeds[0], entry.stop);
      if (kind === 'transfer' && connectAfterBase && etaMs < connectAfterBase + walk) continue;

      add({
        kind,
        route: candidate.route,
        eta: entry.eta.eta,
        dest: namedDest(entry.eta),
        from: namedStop(match.from),
        to: namedStop(match.to),
        waitAfterFirstMinutes: firstArrivalAtInterchange
          ? Math.max(0, Math.round((etaMs - new Date(firstArrivalAtInterchange).getTime()) / 60000))
          : null
      });
    }
  });

  list.sort((a, b) => new Date(a.eta) - new Date(b.eta));
  const withDiscounts = first ? await attachDiscounts(list, first.route) : list;

  let emptyReason = null;
  if (!withDiscounts.length) {
    if (!firstArrivalAtInterchange) emptyReason = 'no_first_bus';
    else emptyReason = 'no_connection';
  }

  return {
    firstArrivalAtInterchange,
    boardDeparture,
    sameStartAndTransfer,
    list: withDiscounts,
    emptyReason
  };
}

export async function planTransfer(cache, stopMap, allStops, body) {
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve({
      firstArrivalAtInterchange: null,
      boardDeparture: null,
      list: [],
      emptyReason: 'timeout'
    }), PLAN_MS);
  });
  try {
    return await Promise.race([plan(cache, stopMap, allStops, body), timeout]);
  } catch {
    return {
      firstArrivalAtInterchange: null,
      boardDeparture: null,
      list: [],
      emptyReason: 'none'
    };
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
