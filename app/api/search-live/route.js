export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache, getDirectoryFast } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { keepFromDirectory, searchLive } from '@/lib/searchLive.js';

const BUDGET_MS = 6500;

export async function GET(request) {
  const route = new URL(request.url).searchParams.get('route') || '';
  const started = Date.now();
  try {
    const directory = await getDirectoryFast(3500);
    if (!(directory.routes || []).length) {
      return json({ error: 'timeout', keep: [], auto: null });
    }
    const fallback = keepFromDirectory(directory, route);
    const remaining = Math.max(1200, BUDGET_MS - (Date.now() - started));
    const work = searchLive(cache, directory, route);
    const result = await Promise.race([
      work,
      new Promise((resolve) => setTimeout(() => resolve(fallback), remaining))
    ]);
    return json(result || fallback || { error: 'timeout', keep: [], auto: null });
  } catch (error) {
    return json({ error: error.message || 'timeout', keep: [], auto: null });
  }
}
