export const dynamic = 'force-dynamic';

import { cache, getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { mtrBusStopEtas } from '@/00-required/mtrbus.js';

export async function GET(_request, { params }) {
  try {
    const { route, stop } = await params;
    const directory = await getDirectory();
    const data = await mtrBusStopEtas(cache, { stop, route, co: 'MTRB' }, directory.routes);
    return json({ data });
  } catch (error) {
    return json({ error: error.message, data: [] }, 502);
  }
}
