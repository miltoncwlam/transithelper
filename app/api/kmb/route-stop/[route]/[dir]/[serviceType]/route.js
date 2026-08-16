export const dynamic = 'force-dynamic';

import { cache, getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { attachStopMeta, kmbFetch } from '@/lib/kmb.js';

const ROUTE_STOP_TTL = 24 * 60 * 60 * 1000;

export async function GET(_request, context) {
  try {
    const { route, dir, serviceType } = await context.params;
    const directory = await getDirectory();
    const rows = await kmbFetch(
      `/route-stop/${encodeURIComponent(route)}/${dir}/${serviceType}`,
      cache,
      ROUTE_STOP_TTL
    );
    return json({ data: attachStopMeta(rows, directory.stopMap) });
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}
