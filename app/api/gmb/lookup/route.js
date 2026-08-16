export const dynamic = 'force-dynamic';

import { cache } from '../../../lib/directory.js';
import { json } from '../../../lib/http.js';
import { gmbLookup } from '../../../lib/gmb.js';

export async function GET(request) {
  const route = new URL(request.url).searchParams.get('route') || '';
  const rows = await gmbLookup(cache, route);
  return json({ data: rows });
}
