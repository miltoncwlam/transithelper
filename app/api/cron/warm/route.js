export const dynamic = 'force-dynamic';

import { ensureCitybusStops } from '@/lib/directory.js';
import { startGtfsLoad } from '@/lib/gtfs.js';
import { json } from '@/lib/http.js';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) {
      return json({ error: 'unauthorized' }, 401);
    }
  }
  try {
    const directory = await ensureCitybusStops();
    const gtfs = await startGtfsLoad();
    return json({
      ok: true,
      routes: directory.routes.length,
      stops: directory.stops.length,
      citybusStops: directory.stops.filter((stop) => stop.co === 'CTB').length,
      gtfsTrips: gtfs?.rows?.length || 0
    });
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}
