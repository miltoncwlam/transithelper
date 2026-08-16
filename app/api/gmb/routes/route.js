export const dynamic = 'force-dynamic';

import { cache } from '../../../lib/directory.js';
import { json } from '../../../lib/http.js';
import { gmbRoutes } from '../../../lib/gmb.js';

export async function GET() {
  const routes = await gmbRoutes(cache);
  return json({ data: routes, count: routes.length });
}
