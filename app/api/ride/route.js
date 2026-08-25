export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache, getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { predictRide } from '@/lib/transfer.js';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const directory = await getDirectory();
    return json(await predictRide(cache, directory.stopMap, body || {}, directory.routes));
  } catch (error) {
    return json({ error: error.message }, 400);
  }
}
