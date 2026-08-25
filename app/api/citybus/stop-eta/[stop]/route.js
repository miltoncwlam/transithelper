export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { citybusStopEtas } from '@/lib/citybus.js';

export async function GET(_request, context) {
  const { stop } = await context.params;
  const rows = await citybusStopEtas(cache, stop);
  return json({ data: rows });
}
