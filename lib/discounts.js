import { getSupabase } from './supabase.js';

const FALLBACK = [
  {
    from_operator: 'KMB',
    to_operator: 'KMB',
    from_route: '960',
    to_route: '961',
    window_minutes: 60,
    discount_amount_hkd: null,
    notes_zh: '九巴 960／961 八達通轉乘優惠以公司公布及車費機為準。',
    notes_en: 'KMB 960/961 Octopus interchange: confirm on the bus reader.',
    source_url: 'https://www.kmb.hk/tc/services/bus-bus-interchange.html',
    active: true
  },
  {
    from_operator: 'KMB',
    to_operator: 'KMB',
    from_route: '961',
    to_route: '960',
    window_minutes: 60,
    discount_amount_hkd: null,
    notes_zh: '九巴 961／960 八達通轉乘優惠以公司公布及車費機為準。',
    notes_en: 'KMB 961/960 Octopus interchange: confirm on the bus reader.',
    source_url: 'https://www.kmb.hk/tc/services/bus-bus-interchange.html',
    active: true
  }
];

function norm(route) {
  return String(route || '').trim().toUpperCase();
}

export function matchDiscount(rows, fromRoute, toRoute, waitMinutes) {
  const from = norm(fromRoute);
  const to = norm(toRoute);
  if (!from || !to || from === to) return null;
  const wait = waitMinutes == null ? 0 : Number(waitMinutes);
  const hit = (rows || []).find((row) => {
    if (row.active === false) return false;
    if (row.from_route && norm(row.from_route) !== from) return false;
    if (row.to_route && norm(row.to_route) !== to) return false;
    if (!row.from_route && !row.to_route) return false;
    const windowMin = Number(row.window_minutes) || 60;
    return wait <= windowMin;
  });
  if (!hit) return null;
  return {
    notes_zh: hit.notes_zh,
    notes_en: hit.notes_en,
    window_minutes: hit.window_minutes,
    discount_amount_hkd: hit.discount_amount_hkd,
    source_url: hit.source_url
  };
}

export async function loadDiscountRows() {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('interchange_discounts').select('*').eq('active', true);
    if (!error && data?.length) return data;
  }
  return FALLBACK;
}

export async function attachDiscounts(list, firstRoute) {
  const rows = await loadDiscountRows();
  return (list || []).map((item) => {
    if (item.kind !== 'transfer' && item.kind !== 'same_stop') return item;
    const discount = matchDiscount(rows, firstRoute, item.route, item.waitAfterFirstMinutes);
    return discount ? { ...item, discount } : item;
  });
}
