export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache, getDirectory, getDirectoryFast } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { gmbLookup } from '@/00-required/gmb.js';
import { keepFromDirectory, keepFromServices, probeKmbRoute, searchLive } from '@/lib/searchLive.js';

const BUDGET_MS = 6500;

function mergeKeep(primary, extra) {
  const keep = [...(primary?.keep || [])];
  const seen = new Set(keep.map((z) => [
    String(z.service?.co || '').toUpperCase(),
    z.service?.route,
    z.service?.bound,
    z.service?.service_type,
    z.service?.gmb_route_id || '',
    z.service?.nlb_route_id || ''
  ].join('|')));
  for (const z of extra?.keep || []) {
    const key = [
      String(z.service?.co || '').toUpperCase(),
      z.service?.route,
      z.service?.bound,
      z.service?.service_type,
      z.service?.gmb_route_id || '',
      z.service?.nlb_route_id || ''
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    keep.push(z);
  }
  if (!keep.length) return primary || extra || { error: 'noRoute', keep: [], auto: null };
  return { keep, auto: keep.length === 1 ? keep[0].service : null };
}

export async function GET(request) {
  const route = new URL(request.url).searchParams.get('route') || '';
  const started = Date.now();
  const gmbEarly = gmbLookup(cache, route).catch(() => []);
  try {
    let directory = await getDirectoryFast(3500);
    if (!(directory.routes || []).length) {
      const waitMs = Math.max(2000, BUDGET_MS - (Date.now() - started));
      directory = await Promise.race([
        getDirectory(),
        new Promise((resolve) => setTimeout(() => resolve(directory), waitMs))
      ]);
    }
    const fallback = keepFromDirectory(directory, route);
    const remaining = Math.max(
      (fallback.keep || []).length ? 800 : 4000,
      BUDGET_MS - (Date.now() - started)
    );
    const work = searchLive(cache, directory, route, { gmbPromise: gmbEarly });
    const result = await Promise.race([
      work,
      new Promise((resolve) => setTimeout(() => resolve(null), remaining))
    ]);
    if (result && (result.keep || []).length) return json(result);
    const gmbWait = Math.max(500, BUDGET_MS - (Date.now() - started));
    const gmbRows = await Promise.race([
      gmbEarly,
      new Promise((resolve) => setTimeout(() => resolve([]), gmbWait))
    ]);
    const gmbKeep = keepFromServices(route, Array.isArray(gmbRows) ? gmbRows : []);
    const merged = mergeKeep(result || fallback, gmbKeep);
    if ((merged.keep || []).length) return json(merged);
    const probed = await probeKmbRoute(cache, route);
    if ((probed.keep || []).length) return json(probed);
    if ((directory.routes || []).length) return json(fallback);
    return json({ error: 'timeout', keep: [], auto: null });
  } catch (error) {
    try {
      const gmbRows = await Promise.race([
        gmbEarly,
        new Promise((resolve) => setTimeout(() => resolve([]), 2000))
      ]);
      const gmbKeep = keepFromServices(route, Array.isArray(gmbRows) ? gmbRows : []);
      if ((gmbKeep.keep || []).length) return json(gmbKeep);
      const probed = await probeKmbRoute(cache, route);
      if ((probed.keep || []).length) return json(probed);
    } catch {}
    return json({ error: error.message || 'timeout', keep: [], auto: null });
  }
}
