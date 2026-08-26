export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { getDirectory, getDirectoryFast } from '@/lib/directory.js';
import { json } from '@/lib/http.js';

export async function GET() {
  try {
    let directory = await getDirectoryFast(8000);
    if (!(directory.routes || []).length) directory = await getDirectory();
    return json({ data: directory.routes });
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}
