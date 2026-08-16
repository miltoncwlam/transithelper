export const dynamic = 'force-dynamic';

import { json } from '../../../../lib/http.js';
import { MTR_LINES } from '../../../../lib/mtr.js';

export async function GET() {
  return json({ data: MTR_LINES });
}
