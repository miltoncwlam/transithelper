export const dynamic = 'force-dynamic';

import { getDirectory } from '../../../lib/directory.js';
import { json } from '../../../lib/http.js';

export async function GET() {
  try {
    const directory = await getDirectory();
    return json({
      routes: directory.routes.length,
      stops: directory.stops.length
    });
  } catch (error) {
    return json({ error: error.message, routes: 0, stops: 0 }, 502);
  }
}
