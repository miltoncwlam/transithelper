export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { gmbRouteStops } from '@/00-required/gmb.js';

export async function GET(_request, context) {
  const { routeId, seq } = await context.params;
  const rows = await gmbRouteStops(cache, { gmb_route_id: routeId, gmb_route_seq: seq });
  return json({ data: rows });
}
