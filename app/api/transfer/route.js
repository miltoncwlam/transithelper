export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache, getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { planTransfer } from '@/00-required/transfer.js';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const directory = await getDirectory();
    const result = await planTransfer(cache, directory.stopMap, directory.stops, body || {}, directory.routes);
    return json(result);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
}
