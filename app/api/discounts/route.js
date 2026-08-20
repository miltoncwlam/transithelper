export const dynamic = 'force-dynamic';

import { loadDiscountIndex, matchDiscount } from '@/lib/discounts.js';
import { json } from '@/lib/http.js';

function publicRow(row) {
  return {
    from_route: row.from_route,
    to_route: row.to_route,
    from_operator: row.from_operator,
    to_operator: row.to_operator,
    from_bound: row.from_bound,
    to_bound: row.to_bound,
    window_minutes: row.window_minutes,
    discount_type: row.discount_type,
    discount_amount_hkd: row.discount_amount_hkd,
    interchange_zh: row.interchange_zh,
    notes_zh: row.notes_zh,
    notes_en: row.notes_en,
    source_url: row.source_url
  };
}

export async function GET(request) {
  const index = await loadDiscountIndex();
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from && to) {
    const hit = matchDiscount(index, from, to, url.searchParams.get('wait'), {
      fromCo: url.searchParams.get('fromCo'),
      toCo: url.searchParams.get('toCo'),
      fromBound: url.searchParams.get('fromBound'),
      toBound: url.searchParams.get('toBound')
    });
    const rows = (index.byPair.get(`${String(from).trim().toUpperCase()}|${String(to).trim().toUpperCase()}`) || [])
      .filter((row) => row.active !== false)
      .map(publicRow);
    return json({ match: hit, data: rows, count: rows.length });
  }
  return json({
    count: index.rows.filter((row) => row.active !== false).length,
    pairs: index.byPair.size,
    data: []
  });
}
