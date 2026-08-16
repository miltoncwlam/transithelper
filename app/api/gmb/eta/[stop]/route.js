export const dynamic = 'force-dynamic';

import { cache } from '../../../../lib/directory.js';
import { json } from '../../../../lib/http.js';
import { gmbStopEta } from '../../../../lib/gmb.js';

export async function GET(_request, context) {
  const { stop } = await context.params;
  const rows = await gmbStopEta(cache, stop);
  return json({ data: rows });
}
