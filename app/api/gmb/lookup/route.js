export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache } from '@/lib/directory.js';
import { attachFaresToRoutes } from '@/00-required/fares.js';
import { json } from '@/lib/http.js';
import { gmbLookup } from '@/00-required/gmb.js';

export async function GET(request) {
  const route = new URL(request.url).searchParams.get('route') || '';
  const rows = await gmbLookup(cache, route);
  return json({ data: await attachFaresToRoutes(rows) });
}
