export const dynamic = 'force-dynamic';
export const maxDuration = 8;

import { cache, getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { searchLive } from '@/lib/searchLive.js';

export async function GET(request) {
  try {
    const route = new URL(request.url).searchParams.get('route') || '';
    const directory = await getDirectory();
    return json(await searchLive(cache, directory, route));
  } catch (error) {
    return json({ error: error.message || 'timeout', keep: [], auto: null }, 502);
  }
}
