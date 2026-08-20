export const dynamic = 'force-dynamic';

import { json } from '@/lib/http.js';
import { publicMtrLines } from '@/lib/mtr.js';

export async function GET() {
  return json({ data: publicMtrLines() });
}
