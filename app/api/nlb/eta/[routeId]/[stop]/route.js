export const dynamic = 'force-dynamic';

import { cache, getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { nlbEta } from '@/lib/nlb.js';

export async function GET(request, context) {
  const { routeId, stop } = await context.params;
  const directory = await getDirectory();
  const service = directory.routes.find((row) => String(row.nlb_route_id) === String(routeId))
    || { co: 'NLB', nlb_route_id: routeId };
  const rows = await nlbEta(cache, stop, service);
  return json({ data: rows });
}
