export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { cache, getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { nearbyBoard } from '@/00-required/nearbyBoard.js';

export async function GET(request) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  const radius = url.searchParams.get('radius') || '200';
  if (lat == null || lng == null) {
    return json({ error: 'lat and lng are required' }, 400);
  }
  try {
    const directory = await getDirectory();
    const data = await nearbyBoard(cache, directory.stops, directory.routes, lat, lng, { radius });
    return json(data);
  } catch (error) {
    return json({ error: error.message, clusters: [] }, 502);
  }
}
