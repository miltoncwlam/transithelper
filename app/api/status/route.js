export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { snapshotDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';

function stats(directory) {
  const routes = directory.routes || [];
  const stops = directory.stops || [];
  return {
    ok: true,
    routes: routes.length,
    stops: stops.length,
    citybusStops: stops.filter((stop) => stop.co === 'CTB').length,
    gmbRoutes: routes.filter((row) => row.co === 'GMB').length,
    nlbRoutes: routes.filter((row) => row.co === 'NLB').length,
    gmbStops: stops.filter((stop) => stop.co === 'GMB').length,
    nlbStops: stops.filter((stop) => stop.co === 'NLB').length,
    fareRoutes: routes.filter((row) => row.full_fare_hkd != null).length,
    sectionFareRoutes: routes.filter((row) => (row.section_prices || []).length > 1).length
  };
}

export async function GET() {
  try {
    const directory = await snapshotDirectory();
    return json(stats(directory));
  } catch (error) {
    return json({ ok: true, error: error.message, routes: 0, stops: 0 });
  }
}
