export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache, getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { planJourneyOptions } from '@/00-required/journey.js';
import { awaitKmbTopology, ensureTopology, graphStats } from '@/00-required/topology.js';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const directory = await getDirectory();
    const graph = await awaitKmbTopology(cache, directory, 8000);
    ensureTopology(cache, directory).catch(() => {});
    const result = await planJourneyOptions(
      cache,
      directory.stopMap,
      directory.stops,
      directory.routes,
      body || {},
      (graph.services || []).length ? { graph } : {}
    );
    return json({
      ...result,
      coverage: result.coverage || graphStats(await ensureTopology(cache, directory).catch(() => null) || { services: [], stops: {}, complete: {} })
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError' || /timeout|aborted/i.test(String(error?.message || ''));
    return json({ error: error.message, options: [], emptyReason: timedOut ? 'timeout' : 'none' }, timedOut ? 400 : 400);
  }
}

export async function GET() {
  const { getTopology, graphStats, startTopologyBuild } = await import('@/00-required/topology.js');
  const { cache, getDirectory } = await import('@/lib/directory.js');
  const graph = await getTopology();
  getDirectory().then((dir) => startTopologyBuild(cache, dir)).catch(() => {});
  return json({ ok: true, coverage: graphStats(graph) });
}
