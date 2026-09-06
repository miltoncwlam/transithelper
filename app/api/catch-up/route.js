export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache, getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { planCatchUp } from '@/00-required/catchup.js';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const directory = await getDirectory();
    return json(await planCatchUp(cache, directory.stopMap, body || {}, directory.routes));
  } catch (error) {
    return json({ error: error.message, catch: null, backup: null, missSame: null, missAlt: null, emptyReason: 'none' }, 400);
  }
}
