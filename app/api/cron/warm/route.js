export const dynamic = 'force-dynamic';

import { getDirectory } from '@/lib/directory.js';
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
    const directory = await getDirectory();
    return json({
      ok: true,
      routes: directory.routes.length,
      stops: directory.stops.length
    });
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}
