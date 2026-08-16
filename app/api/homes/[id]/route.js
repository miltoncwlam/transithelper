export const dynamic = 'force-dynamic';

import { pinHome, removeHome } from '@/lib/homes.js';
import { json, requireDevice } from '@/lib/http.js';

export async function DELETE(request, context) {
  const { id: deviceId, error } = requireDevice(request);
  if (error) return error;
  const { id } = await context.params;
  await removeHome(deviceId, id);
  return json({ ok: true });
}

export async function PATCH(request, context) {
  const { id: deviceId, error } = requireDevice(request);
  if (error) return error;
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  return json({ data: await pinHome(deviceId, id, body.pinned) });
}
