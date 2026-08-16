export const dynamic = 'force-dynamic';

import { loadDiscountRows } from '@/lib/discounts.js';
import { json } from '@/lib/http.js';

export async function GET() {
  const rows = await loadDiscountRows();
  return json({
    data: (rows || []).filter((row) => row.active !== false).map((row) => ({
      from_route: row.from_route,
      to_route: row.to_route,
      from_operator: row.from_operator,
      to_operator: row.to_operator,
      window_minutes: row.window_minutes,
      notes_zh: row.notes_zh,
      notes_en: row.notes_en,
      source_url: row.source_url,
      discount_amount_hkd: row.discount_amount_hkd
    }))
  });
}
