import { getSupabase, getSupabaseAdmin } from './supabase.js';

const FALLBACK = [
  {
    from_operator: 'KMB',
    to_operator: 'KMB',
    from_route: '960',
    to_route: '961',
    from_bound: null,
    window_minutes: 150,
    discount_type: 'free',
    discount_amount_hkd: 0,
    notes_zh: '九巴 960／961 八達通轉乘第二程免費（以公司公布及車費機為準）。',
    notes_en: 'KMB 960/961 Octopus interchange: second bus free. Confirm on the bus reader.',
    source_url: 'https://www.kmb.hk/tc/services/bus-bus-interchange.html',
    active: true
  },
  {
    from_operator: 'KMB',
    to_operator: 'KMB',
    from_route: '961',
    to_route: '960',
    from_bound: null,
    window_minutes: 150,
    discount_type: 'free',
    discount_amount_hkd: 0,
    notes_zh: '九巴 961／960 八達通轉乘第二程免費（以公司公布及車費機為準）。',
    notes_en: 'KMB 961/960 Octopus interchange: second bus free. Confirm on the bus reader.',
    source_url: 'https://www.kmb.hk/tc/services/bus-bus-interchange.html',
    active: true
  }
];

let cached = null;
let loading = null;

function norm(route) {
  return String(route || '').trim().toUpperCase();
}

function operatorParts(code) {
  return norm(code).split(/[+\/]/).map((part) => part.trim()).filter(Boolean);
}

function operatorsMatch(rowOp, itemOp) {
  if (!rowOp || !itemOp) return true;
  const a = new Set(operatorParts(rowOp));
  const b = operatorParts(itemOp);
  if (b.includes('LWB')) b.push('KMB');
  return b.some((code) => a.has(code));
}

function boundOf(value) {
  if (value === 'I' || value === 'inbound') return 'I';
  if (value === 'O' || value === 'outbound') return 'O';
  return null;
}

function pairKey(fromRoute, toRoute) {
  return `${norm(fromRoute)}|${norm(toRoute)}`;
}

function formatDiscountNotes(row) {
  if (row.notes_zh && row.notes_en) {
    return { notes_zh: row.notes_zh, notes_en: row.notes_en };
  }
  const windowMin = Number(row.window_minutes) || 150;
  const amount = row.discount_amount_hkd;
  const type = row.discount_type;
  let zh = row.package_zh || '八達通巴士轉乘優惠';
  let en = 'Octopus bus-bus interchange';
  if (type === 'free') {
    zh = '八達通轉乘第二程免費';
    en = 'Second bus free with Octopus interchange';
  } else if (type === 'off' && amount != null) {
    zh = `八達通轉乘減 $${Number(amount).toFixed(1)}`;
    en = `Octopus interchange $${Number(amount).toFixed(1)} off`;
  } else if (type === 'combined' && amount != null) {
    zh = `兩程合共 $${Number(amount).toFixed(1)}`;
    en = `Two rides combined $${Number(amount).toFixed(1)}`;
  } else if (type === 'pay' && amount != null) {
    zh = `轉乘後付 $${Number(amount).toFixed(1)}`;
    en = `Pay $${Number(amount).toFixed(1)} on the second bus`;
  } else if (type === 'rebate' && amount != null) {
    zh = `八達通回贈 $${Number(amount).toFixed(1)}`;
    en = `Octopus rebate $${Number(amount).toFixed(1)}`;
  }
  zh += `（${windowMin}分鐘內）`;
  en += ` (within ${windowMin} min)`;
  if (row.interchange_zh) {
    zh += ` · ${row.interchange_zh}`;
    en += ` · ${row.interchange_zh}`;
  }
  return { notes_zh: zh, notes_en: en };
}

function hydrateDiscount(row) {
  return { ...row, ...formatDiscountNotes(row) };
}

function buildIndex(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row.active === false) continue;
    const key = pairKey(row.from_route, row.to_route);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return { rows: rows || [], byPair: map };
}

async function downloadPublicJson() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  const base = `${url.replace(/\/$/, '')}/storage/v1/object/public/bus-fares`;
  const res = await fetch(`${base}/discounts.json`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(4000)
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (Array.isArray(json?.files) && json.files.length) {
    const parts = [];
    for (const name of json.files) {
      const part = await fetch(`${base}/${name}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!part.ok) continue;
      const parsed = await part.json();
      parts.push(...(Array.isArray(parsed) ? parsed : parsed.rows || []));
    }
    return { rows: parts };
  }
  return json;
}

async function fetchRows() {
  const sb = getSupabaseAdmin() || getSupabase();
  if (sb) {
    const file = await sb.storage.from('bus-fares').download('discounts.json');
    if (!file.error && file.data) {
      const json = JSON.parse(await file.data.text());
      if (Array.isArray(json?.files) && json.files.length) {
        const parts = [];
        for (const name of json.files) {
          const part = await sb.storage.from('bus-fares').download(name);
          if (part.error || !part.data) continue;
          const parsed = JSON.parse(await part.data.text());
          parts.push(...(Array.isArray(parsed) ? parsed : parsed.rows || []));
        }
        if (parts.length) return parts;
      }
      const rows = Array.isArray(json) ? json : json.rows;
      if (rows?.length) return rows;
    }
  }
  const publicFile = await downloadPublicJson();
  const publicRows = Array.isArray(publicFile) ? publicFile : publicFile?.rows;
  if (publicRows?.length) return publicRows;

  if (sb) {
    const { data, error } = await sb.from('bus_interchange_discounts').select('*').eq('active', true).limit(10000);
    if (!error && data?.length) return data;
    const legacy = await sb.from('interchange_discounts').select('*').eq('active', true);
    if (!legacy.error && legacy.data?.length) return legacy.data;
  }
  return FALLBACK;
}

export async function loadDiscountIndex() {
  if (!cached) cached = buildIndex(FALLBACK.map(hydrateDiscount));
  if (!loading) {
    loading = fetchRows()
      .then((rows) => {
        if (rows?.length) cached = buildIndex(rows.map(hydrateDiscount));
        return cached;
      })
      .catch(() => cached)
      .finally(() => {
        loading = null;
      });
  }
  return cached;
}

export async function loadDiscountRows() {
  const index = await loadDiscountIndex();
  return index.rows;
}

function scoreDiscount(row, wait, opts) {
  if (row.active === false) return -1;
  const windowMin = Number(row.window_minutes) || 150;
  if (wait > windowMin) return -1;
  let score = 1;
  if (opts.fromCo && operatorsMatch(row.from_operator, opts.fromCo)) score += 2;
  if (opts.toCo && operatorsMatch(row.to_operator, opts.toCo)) score += 2;
  const fromBound = boundOf(opts.fromBound);
  const toBound = boundOf(opts.toBound);
  if (fromBound && row.from_bound && row.from_bound === fromBound) score += 3;
  if (toBound && row.to_bound && row.to_bound === toBound) score += 2;
  if (row.discount_type === 'free') score += 4;
  if (row.discount_amount_hkd != null) score += 2;
  return score;
}

export function matchDiscount(rowsOrIndex, fromRoute, toRoute, waitMinutes, opts = {}) {
  const from = norm(fromRoute);
  const to = norm(toRoute);
  if (!from || !to || from === to) return null;
  const wait = waitMinutes == null ? 0 : Number(waitMinutes);
  const list = rowsOrIndex?.byPair
    ? (rowsOrIndex.byPair.get(pairKey(from, to)) || [])
    : (rowsOrIndex || []).filter((row) => norm(row.from_route) === from && norm(row.to_route) === to);
  let best = null;
  let bestScore = -1;
  for (const row of list) {
    const score = scoreDiscount(row, wait, opts);
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  if (!best) return null;
  return {
    notes_zh: best.notes_zh,
    notes_en: best.notes_en,
    window_minutes: best.window_minutes,
    discount_amount_hkd: best.discount_amount_hkd,
    discount_type: best.discount_type,
    interchange_zh: best.interchange_zh,
    source_url: best.source_url
  };
}

function firstRouteOf(first) {
  if (!first) return '';
  if (typeof first === 'string') return first;
  return first.route || '';
}

export async function attachDiscounts(list, first) {
  const index = await loadDiscountIndex();
  const fromRoute = firstRouteOf(first);
  const fromCo = typeof first === 'object' ? first?.co : null;
  const fromBound = typeof first === 'object' ? first?.bound : null;
  return (list || []).map((item) => {
    if (item.kind !== 'transfer' && item.kind !== 'same_stop') return item;
    const discount = matchDiscount(index, fromRoute, item.route, item.waitAfterFirstMinutes, {
      fromCo,
      toCo: item.co,
      fromBound,
      toBound: item.bound
    });
    return discount ? { ...item, discount } : item;
  });
}
