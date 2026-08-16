export const dynamic = 'force-dynamic';

import { cache } from '../../../../../../lib/directory.js';
import { json } from '../../../../../../lib/http.js';
import { kmbFetch } from '../../../../../../lib/kmb.js';

const ETA_TTL = 8 * 1000;

export async function GET(_request, context) {
  try {
    const { route, serviceType } = await context.params;
    const rows = await kmbFetch(
      `/route-eta/${encodeURIComponent(route)}/${serviceType}`,
      cache,
      ETA_TTL
    );
    return json({ data: rows });
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}
