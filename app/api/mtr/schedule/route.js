import { json } from '@/lib/http.js';
import { fetchMtrSchedule, normalizeMtrSchedule, planMtrRide } from '@/lib/mtr.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const line = String(searchParams.get('line') || '').toUpperCase();
    const sta = String(searchParams.get('sta') || '').toUpperCase();
    const dest = String(searchParams.get('dest') || '').toUpperCase();
    if (!line || !sta) {
      return json({ error: 'line and sta are required' }, 400);
    }
    if (dest && dest !== sta) {
      return json(await planMtrRide(line, sta, dest));
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
