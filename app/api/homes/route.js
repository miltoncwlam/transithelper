export const dynamic = 'force-dynamic';

import { addHome, listHomes } from '@/lib/homes.js';
import { json, requireDevice } from '@/lib/http.js';

export async function GET(request) {
  const { id, error } = requireDevice(request);
  if (error) return error;
  return json({ data: await listHomes(id) });
}

export async function POST(request) {
  const { id, error } = requireDevice(request);
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const { type, title, subtitle, payload } = body || {};
  if (!type || !title || !payload) {
    return json({ error: 'type, title and payload are required' }, 400);
  }
  return json({ data: await addHome(id, { type, title, subtitle, payload }) }, 201);
}
