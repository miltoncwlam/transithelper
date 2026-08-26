export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { json } from '@/lib/http.js';
import { resolveRouteLine } from '@/lib/routeLine.js';

function readQuery(request) {
  const url = new URL(request.url);
  return {
    route: url.searchParams.get('route') || '',
    co: url.searchParams.get('co') || '',
    bound: url.searchParams.get('bound') || '',
    orig: url.searchParams.get('orig') || '',
    dest: url.searchParams.get('dest') || '',
    td_route_id: url.searchParams.get('td_route_id') || '',
    stops: []
  };
}

export async function GET(request) {
  try {
    return json(await resolveRouteLine(readQuery(request)));
  } catch (error) {
    return json({ error: error.message, coords: [], source: 'straight' });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = readQuery(request);
    return json(await resolveRouteLine({
      route: body.route || query.route,
      co: body.co || query.co,
      bound: body.bound || query.bound,
      orig: body.orig || query.orig,
      dest: body.dest || query.dest,
      td_route_id: body.td_route_id || query.td_route_id || '',
      stops: Array.isArray(body.stops) ? body.stops : []
    }));
  } catch (error) {
    return json({ error: error.message, coords: [], source: 'straight' });
  }
}
