import { citybusStopEtas, stopCompany } from './citybus.js';
import { gmbStopEta } from './gmb.js';
import { kmbFetchOrEmpty } from './kmb.js';
import { nlbStopEtas } from './nlb.js';

const ETA_TTL = 8 * 1000;

function enrichFromRoutes(eta, routes) {
  if (!eta) return eta;
  const co = String(eta.co || '').toUpperCase();
  if (co === 'GMB' && eta.gmb_route_id) {
    const hit = (routes || []).find((r) => String(r.gmb_route_id) === String(eta.gmb_route_id) && String(r.gmb_route_seq || 1) === String(eta.gmb_route_seq || 1));
    if (!hit) return eta;
    return {
      ...eta,
      route: eta.route || hit.route,
      dest_tc: eta.dest_tc || hit.dest_tc || '',
      dest_en: eta.dest_en || hit.dest_en || '',
      gmb_region: hit.gmb_region
    };
  }
  if (co === 'NLB' && eta.nlb_route_id) {
    const hit = (routes || []).find((r) => String(r.nlb_route_id) === String(eta.nlb_route_id));
    if (!hit) return eta;
    return {
      ...eta,
      route: eta.route || hit.route,
      dest_tc: eta.dest_tc || hit.dest_tc || '',
      dest_en: eta.dest_en || hit.dest_en || ''
    };
  }
  if (co === 'CTB') {
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
  return eta;
}

export async function etasForStop(cache, stop, routes) {
  const co = stopCompany(stop);
  const id = stop?.stop || stop;
  let rows = [];
  if (co === 'CTB') rows = await citybusStopEtas(cache, id);
  else if (co === 'GMB') rows = await gmbStopEta(cache, stop || id, null);
  else if (co === 'NLB') rows = await nlbStopEtas(cache, id, routes);
  else {
    rows = (await kmbFetchOrEmpty(`/stop-eta/${encodeURIComponent(id)}`, cache, ETA_TTL))
      .map((eta) => ({ ...eta, co: eta.co || 'KMB' }));
  }
  return (rows || []).filter((eta) => eta.eta).map((eta) => enrichFromRoutes({ ...eta, co: eta.co || co }, routes));
}
