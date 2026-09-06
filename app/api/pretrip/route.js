export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache, getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { planPretrip } from '@/00-required/pretrip.js';
import { ensureTopology, getTopology } from '@/00-required/topology.js';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const directory = await getDirectory();
    const graph = await getTopology();
    ensureTopology(cache, directory).catch(() => {});
    const result = await planPretrip(
      cache,
      directory.stopMap,
      directory.stops,
      directory.routes,
      body || {},
      (graph.services || []).length ? { graph } : {}
    );
    return json(result);
  } catch (error) {
    return json({ error: error.message, options: [], emptyReason: 'none' }, 400);
  }
}
