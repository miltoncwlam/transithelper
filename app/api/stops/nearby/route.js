export const dynamic = 'force-dynamic';

import { getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { nearestStops } from '@/lib/kmb.js';

export async function GET(request) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  const radius = url.searchParams.get('radius') || '250';
  if (lat == null || lng == null) {
    return json({ error: 'lat and lng are required' }, 400);
  }
  try {
    const directory = await getDirectory();
    const data = nearestStops(directory.stops, lat, lng, radius, 20);
    return json({ data });
  } catch (error) {
    return json({ error: error.message, data: [] }, 502);
  }
}
