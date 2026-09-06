/** Live “what’s here” board: cluster nearby poles, fetch only published ETAs. */
import { buildClusters, clusterLabel, metresBetween, uidOf } from './clusters.js';
import { etasForStop } from './stopEta.js';
import { namedStop, nearestStops } from './kmb.js';

const ETA_POLE_CAP = 10;
const CLUSTER_CAP = 8;
const ROW_CAP = 24;

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

function serviceKey(eta) {
  const co = String(eta.co || 'KMB').toUpperCase();
  if (co === 'GMB') return ['GMB', eta.gmb_route_id || eta.route, eta.gmb_route_seq || eta.dir || ''].join('|');
  if (co === 'NLB') return ['NLB', eta.nlb_route_id || eta.route].join('|');
  if (co === 'MTRB') return ['MTRB', eta.route, eta.dir || ''].join('|');
  return [co, eta.route, eta.dir || eta.bound || 'O', eta.service_type || '1'].join('|');
}

function toService(eta) {
  const co = String(eta.co || 'KMB').toUpperCase();
  return {
    co,
    route: eta.route,
    bound: eta.dir || eta.bound || 'O',
    service_type: String(eta.service_type || '1'),
    gmb_route_id: eta.gmb_route_id || '',
    gmb_route_seq: eta.gmb_route_seq || '',
    nlb_route_id: eta.nlb_route_id || '',
    dest_tc: eta.dest_tc || '',
    dest_en: eta.dest_en || '',
    orig_tc: eta.orig_tc || '',
    orig_en: eta.orig_en || '',
    gmb_region: eta.gmb_region || ''
  };
}

export function groupNearbyStops(stops, origin) {
  const index = buildClusters(stops);
  const clusters = [];
  const seen = new Set();
  for (const stop of stops || []) {
    const cid = index.byUid[uidOf(stop)];
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    const uids = new Set(index.members[cid] || []);
    const members = (stops || []).filter((row) => uids.has(uidOf(row)));
    const metres = Math.min(...members.map((row) => Number(row.metres) || metresBetween(row, origin)));
    clusters.push({
      id: cid,
      metres: Number.isFinite(metres) ? Math.round(metres) : null,
      label_tc: clusterLabel(members, 'zh'),
      label_en: clusterLabel(members, 'en'),
      name_tc: namedStop(members[0]).zh,
      name_en: namedStop(members[0]).en,
      lat: members[0]?.lat,
      long: members[0]?.long,
      stops: members
    });
  }
  return clusters.sort((a, b) => (a.metres ?? 9e9) - (b.metres ?? 9e9)).slice(0, CLUSTER_CAP);
}

function splitRows(rows) {
  const buses = [];
  const gmbs = [];
  for (const row of rows) {
    if (String(row.service.co).toUpperCase() === 'GMB') gmbs.push(row);
    else buses.push(row);
  }
  return { buses, gmbs };
}

export async function nearbyBoard(cache, allStops, routes, lat, lng, opts = {}) {
  const radius = Math.min(400, Math.max(80, Number(opts.radius) || 200));
  const origin = { lat: Number(lat), long: Number(lng) };
  const nearby = nearestStops(allStops, lat, lng, radius, Math.min(60, Number(opts.limit) || 40));
  const clusters = groupNearbyStops(nearby, origin);
  const poleBudget = Math.min(ETA_POLE_CAP, clusters.reduce((n, c) => n + Math.min(4, c.stops.length), 0));
  let used = 0;
  const live = [];
  for (const cluster of clusters) {
    const poles = cluster.stops.slice(0, 4);
    const take = poles.slice(0, Math.max(0, poleBudget - used));
    used += take.length;
    const lists = await mapPool(take, 6, (stop) => etasForStop(cache, stop, routes).catch(() => []));
    const byKey = new Map();
    take.forEach((stop, i) => {
      for (const eta of lists[i] || []) {
        if (!eta?.eta) continue;
        const key = serviceKey(eta);
        const prev = byKey.get(key);
        const etaMs = new Date(eta.eta).getTime();
        if (!Number.isFinite(etaMs)) continue;
        if (!prev || etaMs < prev.etaMs) {
          byKey.set(key, {
            service: toService(eta),
            eta: eta.eta,
            etaMs,
            stop,
            fare: null
          });
        }
      }
    });
    const rows = [...byKey.values()]
      .sort((a, b) => a.etaMs - b.etaMs)
      .slice(0, ROW_CAP)
      .map(({ etaMs, ...row }) => row);
    const { buses, gmbs } = splitRows(rows);
    live.push({
      id: cluster.id,
      metres: cluster.metres,
      label_tc: cluster.label_tc,
      label_en: cluster.label_en,
      lat: cluster.lat,
      long: cluster.long,
      stops: cluster.stops.map((stop) => ({
        stop: stop.stop,
        co: stop.co || 'KMB',
        name_tc: stop.name_tc,
        name_en: stop.name_en,
        lat: stop.lat,
        long: stop.long,
        metres: stop.metres
      })),
      buses,
      gmbs
    });
  }
  return {
    lat: origin.lat,
    lng: origin.long,
    radius,
    clusters: live,
    originGroup: live[0]
      ? { label: live[0].label_tc, stops: live[0].stops }
      : null
  };
}
