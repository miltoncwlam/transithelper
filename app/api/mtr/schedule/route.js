import { json } from '@/lib/http.js';
import { planLrt } from '@/00-required/lightrail.js';
import { fetchMtrSchedule, normalizeMtrSchedule, planMtrRide } from '@/00-required/mtr.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const line = String(searchParams.get('line') || '').toUpperCase();
    const sta = String(searchParams.get('sta') || searchParams.get('station') || '').toUpperCase();
    const dest = String(searchParams.get('dest') || '').toUpperCase();
    const sameLine = searchParams.get('sameLine') === '1' || searchParams.get('sameLine') === 'true';
    if (!line || !sta) {
      return json({ error: 'line and sta are required' }, 400);
    }
    if (line === 'LRT') {
      return json(await planLrt(sta, dest));
    }
    if (dest) {
      return json(await planMtrRide(line, sta, dest, { sameLine }));
    }
    const data = await fetchMtrSchedule(line, sta);
    return json(normalizeMtrSchedule(data, line, sta));
  } catch {
    return json({
      trains: [],
      delayed: false,
      emptyReason: 'unavailable',
      message: null
    });
  }
}
