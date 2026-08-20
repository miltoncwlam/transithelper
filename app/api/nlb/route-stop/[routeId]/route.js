export const dynamic = 'force-dynamic';

import { cache } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { nlbRouteStops } from '@/lib/nlb.js';

export async function GET(_request, context) {
  const { routeId } = await context.params;
  const rows = await nlbRouteStops(cache, { nlb_route_id: routeId, co: 'NLB' });
  return json({ data: rows });
}
