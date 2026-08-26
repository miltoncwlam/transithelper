export const dynamic = 'force-dynamic';

import { cache } from '@/lib/directory.js';
import { json } from '@/lib/http.js';
import { kmbFetchOrEmpty } from '@/00-required/kmb.js';

const ETA_TTL = 8 * 1000;

export async function GET(_request, context) {
  const { stop } = await context.params;
  const rows = await kmbFetchOrEmpty(
    `/stop-eta/${encodeURIComponent(stop)}`,
    cache,
    ETA_TTL
  );
  return json({ data: rows });
}
