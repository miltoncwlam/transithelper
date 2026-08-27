export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache, getDirectory, getDirectoryFast } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { keepFromDirectory, probeKmbRoute, searchLive } from '@/lib/searchLive.js';

const BUDGET_MS = 6500;

export async function GET(request) {
  const route = new URL(request.url).searchParams.get('route') || '';
  const started = Date.now();
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
    if ((fallback.keep || []).length) {
      const remaining = Math.max(800, BUDGET_MS - (Date.now() - started));
      const work = searchLive(cache, directory, route);
      const result = await Promise.race([
        work,
        new Promise((resolve) => setTimeout(() => resolve(fallback), remaining))
      ]);
      return json(result || fallback);
    }
    const probed = await probeKmbRoute(cache, route);
    if ((probed.keep || []).length) return json(probed);
    if ((directory.routes || []).length) return json(fallback);
    return json({ error: 'timeout', keep: [], auto: null });
  } catch (error) {
    try {
      const probed = await probeKmbRoute(cache, route);
      if ((probed.keep || []).length) return json(probed);
    } catch {}
    return json({ error: error.message || 'timeout', keep: [], auto: null });
  }
}
