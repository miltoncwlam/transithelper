export const dynamic = 'force-dynamic';

import { getDirectory } from '@/lib/directory.js';
import { json } from '@/lib/http.js';

export async function GET() {
  try {
    const directory = await getDirectory();
    return json({ data: directory.routes });
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}
