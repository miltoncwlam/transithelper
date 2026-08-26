export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache, getDirectory, addStops } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { citybusRouteStops } from '@/00-required/citybus.js';

export async function GET(_request, context) {
  const { route, dir } = await context.params;
  const bound = dir === 'inbound' ? 'I' : 'O';
  const directory = await getDirectory();
  const rows = await citybusRouteStops(cache, { route, bound }, directory.stopMap);
  addStops(rows);
  return json({ data: rows });
}
