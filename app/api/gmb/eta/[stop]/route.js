export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { gmbStopEta } from '@/00-required/gmb.js';

export async function GET(request, context) {
  const { stop } = await context.params;
  const url = new URL(request.url);
  const service = {
    gmb_route_id: url.searchParams.get('routeId') || undefined,
    gmb_route_seq: url.searchParams.get('routeSeq') || undefined,
    route: url.searchParams.get('route') || undefined
  };
  const stopSeq = url.searchParams.get('stopSeq');
  const rows = await gmbStopEta(
    cache,
    stopSeq ? { stop, seq: stopSeq } : stop,
    service.gmb_route_id ? service : null
  );
  return json({ data: rows });
}
