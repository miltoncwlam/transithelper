export const dynamic = 'force-dynamic';

import { cache } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { gmbRouteStops } from '@/lib/gmb.js';

export async function GET(_request, context) {
  const { routeId, seq } = await context.params;
  const rows = await gmbRouteStops(cache, { gmb_route_id: routeId, gmb_route_seq: seq });
  return json({ data: rows });
}
