export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';

export async function GET() {
  try {
    const directory = await getDirectory();
    return json({
      routes: directory.routes.length,
      stops: directory.stops.length,
      citybusStops: directory.stops.filter((stop) => stop.co === 'CTB').length,
      gmbRoutes: directory.routes.filter((row) => row.co === 'GMB').length,
      nlbRoutes: directory.routes.filter((row) => row.co === 'NLB').length,
      gmbStops: directory.stops.filter((stop) => stop.co === 'GMB').length,
      nlbStops: directory.stops.filter((stop) => stop.co === 'NLB').length,
      fareRoutes: directory.routes.filter((row) => row.full_fare_hkd != null).length,
      sectionFareRoutes: directory.routes.filter((row) => (row.section_prices || []).length > 1).length
    });
  } catch (error) {
    return json({ error: error.message, routes: 0, stops: 0 }, 502);
  }
}
