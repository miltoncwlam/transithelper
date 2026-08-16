import { json } from '../../../../lib/http.js';
import { fetchMtrSchedule, normalizeMtrSchedule } from '../../../../lib/mtr.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const line = String(searchParams.get('line') || '');
    const sta = String(searchParams.get('sta') || '');
    if (!line || !sta) {
      return json({ error: 'line and sta are required' }, 400);
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
