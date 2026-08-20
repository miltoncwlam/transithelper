export const dynamic = 'force-dynamic';

import { cache, getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { etasForStop } from '@/lib/stopEta.js';

export async function GET(request) {
  const url = new URL(request.url);
  const stop = url.searchParams.get('stop');
  const co = url.searchParams.get('co') || '';
  if (!stop) return json({ error: 'stop is required' }, 400);
  try {
    const directory = await getDirectory();
    const known = directory.stopMap.get(`${String(co || '').toUpperCase()}:${stop}`)
      || directory.stopMap.get(stop)
      || { stop, co: co || undefined };
    const data = await etasForStop(cache, { ...known, stop, co: known.co || co || undefined }, directory.routes);
    return json({ data });
  } catch (error) {
    return json({ error: error.message, data: [] }, 502);
  }
}
