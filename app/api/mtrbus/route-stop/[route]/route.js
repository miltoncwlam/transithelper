export const dynamic = 'force-dynamic';

import { cache } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { mtrBusRouteStops } from '@/00-required/mtrbus.js';

export async function GET(_request, { params }) {
  try {
    const { route } = await params;
    const data = await mtrBusRouteStops(cache, { route, co: 'MTRB' });
    return json({ data });
  } catch (error) {
    return json({ error: error.message, data: [] }, 502);
  }
}
