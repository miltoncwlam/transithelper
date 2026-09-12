/** Next live clock if you miss the locked trip. Never chase this vehicle to a later pole. */
import { namedStop } from './kmb.js';
import {
  firstRouteEtaTables,
  metresBetween,
  routeStops,
  serviceCompany,
  walkMs
} from './transfer.js';

const SAME_CLOCK_MS = 45 * 1000;

function emptyResult(emptyReason, extra = {}) {
  return {
    catch: null,
    backup: null,
    missSame: extra.missSame || null,
    missAlt: extra.missAlt || null,
    emptyReason
  };
}

function packResult({ catch: catchPole, backup, missSame, missAlt }) {
  const has = !!(catchPole || backup || missSame || missAlt);
  return {
    catch: catchPole || null,
    backup: backup || null,
    missSame: missSame || null,
    missAlt: missAlt || null,
    emptyReason: has ? null : 'none'
  };
}

export function isLightRail(first, body = {}) {
  const co = String(first?.co || first?.line || body?.mode || '').toUpperCase();
  return co === 'LRT' || body?.mode === 'lrt';
}

function etaMs(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function waitMinutes(ms, nowMs) {
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((ms - nowMs) / 60000));
}

function clocksFromTables(row, tables) {
  if (!row || !tables) return [];
  const raw = tables.byStop?.size
    ? tables.byStop.get(row.stop)
    : tables.bySeq?.size
      ? tables.bySeq.get(Number(row.seq))
      : null;
  return (raw || [])
    .map((item) => item?.eta || item)
    .filter((eta) => Number.isFinite(etaMs(eta)));
}

export function nextLiveClock(etas, lockedEta, nowMs = Date.now()) {
  const locked = etaMs(lockedEta);
  if (!Number.isFinite(locked)) return null;
  const later = (etas || [])
    .map((eta) => ({ eta, ms: etaMs(eta) }))
    .filter((row) => Number.isFinite(row.ms) && row.ms > locked + SAME_CLOCK_MS)
    .sort((a, b) => a.ms - b.ms);
  const hit = later[0];
  if (!hit) return null;
  return {
    eta: hit.eta,
    waitMinutes: waitMinutes(hit.ms, nowMs)
  };
}

function sameService(row, locked) {
  return String(row?.route || '').toUpperCase() === String(locked?.route || '').toUpperCase()
    && String(row?.co || locked?.co || 'KMB').toUpperCase() === String(locked?.co || 'KMB').toUpperCase();
}

export function pickMissAlt(alternatives, locked, missSame, nowMs = Date.now()) {
  const lockedMs = etaMs(locked?.eta);
  const sameWaitMs = missSame ? etaMs(missSame.eta) : Infinity;
  const rows = (alternatives || [])
    .filter((row) => {
      if (!row?.eta) return false;
      const ms = etaMs(row.eta);
      if (!Number.isFinite(ms)) return false;
      if (sameService(row, locked) && Number.isFinite(lockedMs) && Math.abs(ms - lockedMs) < SAME_CLOCK_MS) {
        return false;
      }
      if (sameService(row, locked) && missSame && Math.abs(ms - etaMs(missSame.eta)) < SAME_CLOCK_MS) {
        return false;
      }
      return true;
    })
    .sort((a, b) => etaMs(a.eta) - etaMs(b.eta));
  const best = rows[0];
  if (!best) return null;
  const altMs = etaMs(best.eta);
  if (Number.isFinite(sameWaitMs) && altMs >= sameWaitMs) return null;
  return {
    route: best.route,
    co: best.co || locked?.co || 'KMB',
    kind: best.kind || 'direct',
    second: best.second?.route || best.secondRoute || null,
    eta: best.eta,
    waitMinutes: waitMinutes(altMs, nowMs),
    dest: best.dest || null
  };
}

export function hasLiveTripAnchor(followed) {
  if (followed?.boardLive) return true;
  return (followed?.stops || []).some((stop) => stop && stop.estimated === false);
}

function nearestSeqIndex(seq, here) {
  if (!here || !seq?.length) return -1;
  let best = -1;
  let bestM = Infinity;
  seq.forEach((row, i) => {
    const metres = metresBetween(here, row);
    if (metres < bestM) {
      bestM = metres;
      best = i;
    }
  });
  return best;
}

function walkMinutesOf(from, to) {
  const metres = metresBetween(from, to);
  if (!Number.isFinite(metres) || metres < 40) return Math.max(1, Math.round(walkMs(from, to) / 60000));
  return Math.max(1, Math.round(walkMs(from, to) / 60000));
}

function followedAt(followed, seq, boardIdx, index) {
  const byStop = (followed?.stops || []).find((row) => row?.stop && row.stop === seq[index]?.stop);
  if (byStop) return byStop;
  return (followed?.stops || [])[index - boardIdx] || null;
}

export function pickCatchPoles({ seq, boardIdx, destIdx, followed, here, nowMs, thisStopOnly }) {
  if (thisStopOnly || !seq?.length || boardIdx < 0 || !hasLiveTripAnchor(followed)) {
    return { catch: null, backup: null };
  }
  const gpsIdx = nearestSeqIndex(seq, here);
  const startIdx = gpsIdx > boardIdx ? gpsIdx : boardIdx;
  const lastExclusive = destIdx > startIdx ? destIdx : seq.length;
  const candidates = [];
  for (let i = startIdx + 1; i < lastExclusive; i += 1) {
    const row = seq[i];
    const followedStop = followedAt(followed, seq, boardIdx, i);
    if (!followedStop?.time) continue;
    const busMs = etaMs(followedStop.time);
    if (!Number.isFinite(busMs)) continue;
    const walk = walkMs(here, row);
    if (nowMs + walk > busMs) continue;
    candidates.push({
      stop: row.stop,
      name: followedStop.name || namedStop(row),
      seqIndex: i,
      walkMinutes: walkMinutesOf(here, row),
      walkMs: walk,
      busEta: followedStop.time,
      busMinutes: waitMinutes(busMs, nowMs),
      estimated: !!followedStop.estimated,
      slack: busMs - (nowMs + walk)
    });
  }
  candidates.sort((a, b) => a.walkMs - b.walkMs || new Date(a.busEta) - new Date(b.busEta) || a.seqIndex - b.seqIndex);
  const catchPole = candidates[0] || null;
  const backup = catchPole
    ? candidates.find((row) => row.seqIndex > catchPole.seqIndex) || null
    : null;
  return { catch: catchPole, backup };
}

export async function planCatchUp(cache, stopMap, body = {}, routes = [], opts = {}) {
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const first = body.first;
  const eta = body.eta || body.board;
  const boardIds = new Set((body.boardStops || []).map((id) => String(id)));
  if (!first?.route || !boardIds.size || !eta) {
    return emptyResult('incomplete');
  }

  const locked = { route: first.route, co: serviceCompany(first), eta };
  let missSame = nextLiveClock(body.laterEtas, eta, nowMs);
  const missAlt = pickMissAlt(body.alternatives, locked, missSame, nowMs);

  if (missSame || isLightRail(first, body)) {
    return packResult({ catch: null, backup: null, missSame, missAlt });
  }

  const loadRouteStops = opts.loadRouteStops || ((svc) => routeStops(cache, stopMap, svc));
  const seq = await loadRouteStops(first);
  const boardIdx = (seq || []).findIndex((row) => boardIds.has(String(row.stop)));
  if (!seq?.length || boardIdx < 0) {
    return packResult({ catch: null, backup: null, missSame, missAlt });
  }

  let tables = opts.tables || null;
  if (!tables) {
    const loadTables = opts.loadTables || ((svc, rows, fromIdx, untilIdx) => (
      firstRouteEtaTables(cache, svc, rows, fromIdx, untilIdx)
    ));
    tables = await loadTables(first, seq, boardIdx, boardIdx);
  }
  missSame = nextLiveClock(clocksFromTables(seq[boardIdx], tables), eta, nowMs);
  return packResult({ catch: null, backup: null, missSame, missAlt });
}
