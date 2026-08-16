export const dynamic = 'force-dynamic';

import { cache } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { citybusRouteStops } from '@/lib/citybus.js';

export async function GET(_request, context) {
  const { route, dir } = await context.params;
  const bound = dir === 'inbound' ? 'I' : 'O';
  const rows = await citybusRouteStops(cache, { route, bound });
  return json({ data: rows });
}
