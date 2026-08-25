export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { citybusStopEta } from '@/lib/citybus.js';

export async function GET(_request, context) {
  const { stop, route } = await context.params;
  const rows = await citybusStopEta(cache, stop, route);
  return json({ data: rows });
}
