#!/usr/bin/env node
/**
 * Fetch official HK bus 分段收費 and interchange discounts, then upload
 * to the TransitBuddy Supabase project (Storage always; tables if present).
 *
 * Sources:
 * - Transport Department FARE_BUS.xml / FARE_GMB.xml (on_seq → off_seq matrix)
 * - KMB https://www.kmb.hk/storage/BBI_routeF1.js and BBI_routeB1.js
 * - Citybus https://www.citybus.com.hk/concessionApi/public/bbi/api/v1/scheme/{tc|en}/{page}
 *
 * Usage: node scripts/import-bus-fares.mjs
 * Optional: BUS_FARE_CACHE=/tmp/hkfares  (reuse already-downloaded XML/JS)
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'bus-fares';
const TD_BASE = 'https://static.data.gov.hk/td/routes-fares-xml';
const KMB_F1 = 'https://www.kmb.hk/storage/BBI_routeF1.js';
const KMB_B1 = 'https://www.kmb.hk/storage/BBI_routeB1.js';
const CTB_TC = 'https://www.citybus.com.hk/concessionApi/public/bbi/api/v1/scheme/tc/';
const CTB_EN = 'https://www.citybus.com.hk/concessionApi/public/bbi/api/v1/scheme/en/';
const KMB_BBI_URL = 'https://www.kmb.hk/tc/services/bus-bus-interchange.html';
const CTB_BBI_URL = 'https://www.citybus.com.hk/concession/';

function loadEnv(text) {
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function xmlTag(block, name) {
  const open = `<${name}>`;
  const i = block.indexOf(open);
  if (i < 0) return '';
  const j = block.indexOf(`</${name}>`, i);
  if (j < 0) return '';
  return block.slice(i + open.length, j).trim();
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function money(value) {
  const n = num(value);
  return n == null ? null : Math.round(n * 10) / 10;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function rowId(parts) {
  return createHash('sha1').update(parts.map((x) => String(x ?? '')).join('\0')).digest('hex');
}

async function download(url, dest, maxAgeMs = 0) {
  if (maxAgeMs) {
    try {
      const info = await stat(dest);
      if (Date.now() - info.mtimeMs < maxAgeMs && info.size > 100) {
        console.log('  cache', path.basename(dest), info.size, 'bytes');
        return dest;
      }
    } catch {}
  }
  console.log('  GET', url);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TransitBuddy/1.0', Accept: '*/*' },
    signal: AbortSignal.timeout(180000)
  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  const info = await stat(dest);
  console.log('  saved', path.basename(dest), info.size, 'bytes');
  return dest;
}

async function forXmlRecords(file, tag, fn) {
  const start = `<${tag}>`;
  const end = `</${tag}>`;
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  let buf = '';
  let inRec = false;
  for await (const line of rl) {
    if (!inRec) {
      const i = line.indexOf(start);
      if (i < 0) continue;
      inRec = true;
      buf = line.slice(i);
    } else {
      buf += line;
    }
    const j = buf.indexOf(end);
    if (j >= 0) {
      fn(buf.slice(0, j + end.length));
      buf = '';
      inRec = false;
    }
  }
}

function parseRouteBlock(block) {
  const id = Number(xmlTag(block, 'ROUTE_ID'));
  if (!id) return null;
  return {
    route_id: id,
    company_code: clean(xmlTag(block, 'COMPANY_CODE')),
    route_name: clean(xmlTag(block, 'ROUTE_NAMEC') || xmlTag(block, 'ROUTE_NAMEE')),
    route_name_en: clean(xmlTag(block, 'ROUTE_NAMEE') || xmlTag(block, 'ROUTE_NAMEC')),
    journey_time_minutes: num(xmlTag(block, 'JOURNEY_TIME')),
    full_fare_hkd: money(xmlTag(block, 'FULL_FARE')),
    orig_zh: clean(xmlTag(block, 'LOC_START_NAMEC')),
    orig_en: clean(xmlTag(block, 'LOC_START_NAMEE')),
    dest_zh: clean(xmlTag(block, 'LOC_END_NAMEC')),
    dest_en: clean(xmlTag(block, 'LOC_END_NAMEE'))
  };
}

async function parseRouteFile(file, into) {
  let n = 0;
  await forXmlRecords(file, 'ROUTE', (block) => {
    const row = parseRouteBlock(block);
    if (!row) return;
    into.set(row.route_id, row);
    n += 1;
  });
  return n;
}

async function parseFareFile(file, cells) {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  let id = 0;
  let seq = 0;
  let on = 0;
  let off = 0;
  let n = 0;
  for await (const raw of rl) {
    const line = raw.trim();
    if (line.startsWith('<ROUTE_ID>')) id = Number(xmlTag(line, 'ROUTE_ID'));
    else if (line.startsWith('<ROUTE_SEQ>')) seq = Number(xmlTag(line, 'ROUTE_SEQ'));
    else if (line.startsWith('<ON_SEQ>')) on = Number(xmlTag(line, 'ON_SEQ'));
    else if (line.startsWith('<OFF_SEQ>')) off = Number(xmlTag(line, 'OFF_SEQ'));
    else if (line.startsWith('<PRICE>')) {
      const price = money(xmlTag(line, 'PRICE'));
      if (!id || !seq || !on || !off || price == null || off <= on) continue;
      const key = `${id}|${seq}`;
      let row = cells.get(key);
      if (!row) {
        row = { route_id: id, route_seq: seq, max: 0, prices: new Map() };
        cells.set(key, row);
      }
      row.max = Math.max(row.max, on, off);
      row.prices.set((on << 16) | off, price);
      n += 1;
    }
  }
  return n;
}

function packMatrix(cell) {
  const n = cell.max;
  const lanes = Array.from({ length: n }, (_, i) => Array(n - i - 1).fill(null));
  for (const [packed, price] of cell.prices) {
    const on = packed >> 16;
    const off = packed & 0xffff;
    const lane = lanes[on - 1];
    const idx = off - on - 1;
    if (lane && idx >= 0 && idx < lane.length) lane[idx] = price;
  }
  return lanes;
}

function uniquePrices(lanes) {
  const seen = new Set();
  for (const lane of lanes) {
    for (const price of lane) {
      if (price != null) seen.add(price);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

function directionMeta(meta, seq) {
  if (!meta) return { bound: Number(seq) === 2 ? 'I' : 'O' };
  if (Number(seq) === 2) {
    return {
      bound: 'I',
      orig_zh: meta.dest_zh,
      orig_en: meta.dest_en,
      dest_zh: meta.orig_zh,
      dest_en: meta.orig_en
    };
  }
  return {
    bound: 'O',
    orig_zh: meta.orig_zh,
    orig_en: meta.orig_en,
    dest_zh: meta.dest_zh,
    dest_en: meta.dest_en
  };
}

function buildFareRoutes(routeMeta, cells, source) {
  const rows = [];
  for (const cell of cells.values()) {
    const meta = routeMeta.get(cell.route_id);
    const packed = packMatrix(cell);
    const prices = uniquePrices(packed);
    const full = packed[0]?.length ? packed[0][packed[0].length - 1] : null;
    const dir = directionMeta(meta, cell.route_seq);
    rows.push({
      route_id: cell.route_id,
      route_seq: cell.route_seq,
      company_code: meta?.company_code || '',
      route_name: meta?.route_name || String(cell.route_id),
      route_name_en: meta?.route_name_en || meta?.route_name || String(cell.route_id),
      bound: dir.bound,
      orig_zh: dir.orig_zh || null,
      orig_en: dir.orig_en || null,
      dest_zh: dir.dest_zh || null,
      dest_en: dir.dest_en || null,
      journey_time_minutes: meta?.journey_time_minutes ?? null,
      full_fare_hkd: full ?? meta?.full_fare_hkd ?? null,
      stop_count: cell.max,
      section_prices: prices,
      section_fares: packed,
      source
    });
  }
  rows.sort((a, b) => a.route_id - b.route_id || a.route_seq - b.route_seq);
  return rows;
}

function kmbWindow(symbol) {
  if (symbol === '^') return 30;
  if (symbol === '#') return 60;
  if (symbol === '*') return 90;
  if (symbol === '@') return 120;
  return 150;
}

function parseKmbDiscount(raw) {
  const text = String(raw || '');
  if (text.includes('免費')) return { type: 'free', amount: 0 };
  let m = text.match(/減\s*\$([0-9.]+)/);
  if (m) return { type: 'off', amount: money(m[1]) };
  m = text.match(/兩程合共\s*\$([0-9.]+)/);
  if (m) return { type: 'combined', amount: money(m[1]) };
  m = text.match(/付\s*\$([0-9.]+)/);
  if (m) return { type: 'pay', amount: money(m[1]) };
  m = text.match(/回贈\s*\$([0-9.]+)/);
  if (m) return { type: 'rebate', amount: money(m[1]) };
  return { type: 'other', amount: null };
}

function kmbNotes(parsed, windowMin, interchange, specZh, specEn) {
  let zh = '八達通巴士轉乘優惠';
  let en = 'Octopus bus-bus interchange';
  if (parsed.type === 'free') {
    zh = '八達通轉乘第二程免費';
    en = 'Second bus free with Octopus interchange';
  } else if (parsed.type === 'off' && parsed.amount != null) {
    zh = `八達通轉乘減 $${parsed.amount.toFixed(1)}`;
    en = `Octopus interchange $${parsed.amount.toFixed(1)} off`;
  } else if (parsed.type === 'combined' && parsed.amount != null) {
    zh = `兩程合共 $${parsed.amount.toFixed(1)}`;
    en = `Two rides combined $${parsed.amount.toFixed(1)}`;
  } else if (parsed.type === 'pay' && parsed.amount != null) {
    zh = `轉乘後付 $${parsed.amount.toFixed(1)}`;
    en = `Pay $${parsed.amount.toFixed(1)} on the second bus`;
  } else if (parsed.type === 'rebate' && parsed.amount != null) {
    zh = `八達通回贈 $${parsed.amount.toFixed(1)}`;
    en = `Octopus rebate $${parsed.amount.toFixed(1)}`;
  }
  zh += `（${windowMin}分鐘內）`;
  en += ` (within ${windowMin} min)`;
  if (interchange) {
    zh += ` · ${interchange}`;
    en += ` · ${interchange}`;
  }
  if (specZh) zh += ` ${specZh}`;
  if (specEn) en += ` ${specEn}`;
  return { zh, en };
}

function parseKmbBbi(data, source, fromBound) {
  const rows = [];
  for (const [fromRoute, payload] of Object.entries(data || {})) {
    const fromDest = clean(payload?.bus_arr?.[0]?.dest);
    for (const rec of payload?.Records || []) {
      const toRoute = clean(rec.sec_routeno).toUpperCase();
      const from = clean(fromRoute).toUpperCase();
      if (!from || !toRoute) continue;
      const parsed = parseKmbDiscount(rec.discount_max);
      const windowMin = kmbWindow(rec.validity);
      const interchange = clean(rec.xchange);
      const notes = kmbNotes(parsed, windowMin, interchange, clean(rec.spec_remark_chi), clean(rec.spec_remark_eng));
      rows.push({
        id: rowId([source, from, toRoute, fromBound, fromDest, rec.sec_dest, interchange, rec.discount_max]),
        source,
        from_operator: 'KMB',
        to_operator: 'KMB',
        from_route: from,
        to_route: toRoute,
        from_bound: fromBound,
        to_bound: null,
        from_dest_zh: fromDest || null,
        to_dest_zh: clean(rec.sec_dest) || null,
        interchange_zh: interchange || null,
        discount_type: parsed.type,
        discount_code: clean(rec.validity) || null,
        discount_raw: clean(rec.discount_max) || null,
        discount_amount_hkd: parsed.amount,
        child_hkd: null,
        senior_hkd: null,
        total_fare_hkd: null,
        window_minutes: windowMin,
        max_changes: num(rec.success_cnt),
        package_zh: null,
        notes_zh: notes.zh,
        notes_en: notes.en,
        source_url: KMB_BBI_URL,
        active: true
      });
    }
  }
  return rows;
}

function ctbOperator(value) {
  const raw = clean(value).toUpperCase();
  if (raw.includes('KMB') && raw.includes('CTB')) return 'KMB+CTB';
  if (raw.includes('LWB')) return 'LWB';
  if (raw.includes('NWFB') || raw.includes('CTB')) return 'CTB';
  if (raw.includes('KMB')) return 'KMB';
  if (raw.includes('NLB')) return 'NLB';
  return raw || 'CTB';
}

function ctbBound(value) {
  const raw = clean(value).toUpperCase();
  if (raw === 'B' || raw === 'I') return 'I';
  if (raw === 'F' || raw === 'O') return 'O';
  return raw || null;
}

function parseCtbAmount(row) {
  const code = clean(row.discount).toUpperCase();
  const adult = money(row.discountAmount?.adult);
  const total = money(row.totalFare?.adult);
  const remark = clean(row.remark);
  let type = 'scheme';
  let amount = adult;
  if (code === 'FR') type = adult != null ? 'off' : 'scheme';
  else if (code === 'FF') type = adult == null || adult === 0 ? 'free' : 'off';
  else if (code === 'TF') {
    type = total != null ? 'combined' : 'scheme';
    amount = total ?? adult;
  } else if (code === 'L1' || code === 'L2') type = adult != null ? 'off' : 'scheme';
  if (amount == null) {
    const off = remark.match(/減\s*\$?([0-9.]+)/);
    const combined = remark.match(/兩程合共\s*\$?([0-9.]+)/);
    const pay = remark.match(/付\s*\$?([0-9.]+)/);
    if (remark.includes('免費') && !off) {
      type = 'free';
      amount = 0;
    } else if (combined) {
      type = 'combined';
      amount = money(combined[1]);
    } else if (pay) {
      type = 'pay';
      amount = money(pay[1]);
    } else if (off) {
      type = 'off';
      amount = money(off[1]);
    }
  }
  return { type, amount, total, code };
}

function ctbNotes(row, parsed, windowMin, remarkEn) {
  const pkg = clean(row.packageDesc);
  const remark = clean(row.remark);
  const stop = clean(row.stopName);
  let zh = pkg || '城巴八達通轉乘優惠';
  let en = remarkEn || pkg || 'Citybus Octopus interchange';
  if (parsed.type === 'free') {
    zh = '八達通轉乘第二程免費';
    en = 'Second bus free with Octopus interchange';
  } else if (parsed.type === 'off' && parsed.amount != null) {
    zh = `八達通轉乘減 $${parsed.amount.toFixed(1)}`;
    en = `Octopus interchange $${parsed.amount.toFixed(1)} off`;
  } else if (parsed.type === 'combined' && parsed.amount != null) {
    zh = `兩程合共 $${parsed.amount.toFixed(1)}`;
    en = `Two rides combined $${parsed.amount.toFixed(1)}`;
  }
  if (windowMin) {
    zh += `（${windowMin}分鐘內）`;
    en += ` (within ${windowMin} min)`;
  }
  if (stop) {
    zh += ` · ${stop}`;
    en += ` · ${stop}`;
  }
  if (remark) zh += ` ${remark}`;
  if (remarkEn && remarkEn !== remark) en += ` ${remarkEn}`;
  return { zh: zh.trim(), en: en.trim() };
}

function parseCtbPage(tcRows, enRows) {
  const rows = [];
  for (let i = 0; i < tcRows.length; i += 1) {
    const row = tcRows[i];
    const fromRoute = clean(row.firstRoute).toUpperCase();
    const toRoute = clean(row.secondRoute).toUpperCase();
    if (!fromRoute || !toRoute) continue;
    const parsed = parseCtbAmount(row);
    const windowMin = num(row.timeLimit);
    const remarkEn = clean(enRows[i]?.remark);
    const notes = ctbNotes(row, parsed, windowMin, remarkEn);
    const fromBound = ctbBound(row.firstBound);
    const toBound = ctbBound(row.secondBound);
    const interchange = clean(row.stopName);
    rows.push({
      id: rowId(['ctb-bbi', fromRoute, toRoute, fromBound, toBound, interchange, row.discount, row.remark, row.sort_seq, row.second_sort_seq]),
      source: 'ctb-bbi',
      from_operator: ctbOperator(row.firstProvider),
      to_operator: ctbOperator(row.secondProvider),
      from_route: fromRoute,
      to_route: toRoute,
      from_bound: fromBound,
      to_bound: toBound,
      from_dest_zh: clean(row.firstDirection) || null,
      to_dest_zh: clean(row.secondDirection) || null,
      interchange_zh: interchange || null,
      discount_type: parsed.type,
      discount_code: parsed.code || null,
      discount_raw: clean(row.discount) || null,
      discount_amount_hkd: parsed.amount,
      child_hkd: money(row.discountAmount?.child),
      senior_hkd: money(row.discountAmount?.senior),
      total_fare_hkd: parsed.total,
      window_minutes: windowMin,
      max_changes: null,
      package_zh: clean(row.packageDesc) || null,
      notes_zh: notes.zh,
      notes_en: notes.en,
      source_url: CTB_BBI_URL,
      active: true
    });
  }
  return rows;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'TransitBuddy/1.0' },
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

async function fetchCtbBbi() {
  const rows = [];
  let empty = 0;
  for (let page = 1; page <= 120; page += 1) {
    let tc = [];
    let en = [];
    try {
      [tc, en] = await Promise.all([
        fetchJson(CTB_TC + page),
        fetchJson(CTB_EN + page)
      ]);
    } catch (error) {
      empty += 1;
      if (empty >= 12) break;
      continue;
    }
    if (!Array.isArray(tc) || !tc.length) {
      empty += 1;
      if (empty >= 12) break;
      continue;
    }
    empty = 0;
    const parsed = parseCtbPage(tc, Array.isArray(en) ? en : []);
    rows.push(...parsed);
    if (page % 10 === 0) console.log('  citybus BBI page', page, 'rows', rows.length);
  }
  return rows;
}

async function tableExists(sb, table) {
  const { error } = await sb.from(table).select('*').limit(1);
  return !error;
}

async function upsertBatches(sb, table, rows, onConflict, chunk = 200) {
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await sb.from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`${table} upsert ${i}: ${error.message}`);
    if (i === 0 || (i + slice.length) % 1000 === 0 || i + slice.length === rows.length) {
      console.log(`  ${table} ${Math.min(i + slice.length, rows.length)}/${rows.length}`);
    }
  }
}

async function ensureBucket(sb) {
  const { data, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);
  const exists = (data || []).some((row) => row.id === BUCKET || row.name === BUCKET);
  if (!exists) {
    const created = await sb.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: '120MB'
    });
    if (created.error && !/already exists/i.test(created.error.message || '')) {
      throw new Error(`createBucket: ${created.error.message}`);
    }
  }
  const updated = await sb.storage.updateBucket(BUCKET, {
    public: true,
    fileSizeLimit: '120MB'
  });
  if (updated.error) console.log('  bucket limit', updated.error.message);
}

function compactDiscount(row) {
  return {
    id: row.id,
    source: row.source,
    from_operator: row.from_operator,
    to_operator: row.to_operator,
    from_route: row.from_route,
    to_route: row.to_route,
    from_bound: row.from_bound,
    to_bound: row.to_bound,
    from_dest_zh: row.from_dest_zh,
    to_dest_zh: row.to_dest_zh,
    interchange_zh: row.interchange_zh,
    discount_type: row.discount_type,
    discount_code: row.discount_code,
    discount_raw: row.discount_raw,
    discount_amount_hkd: row.discount_amount_hkd,
    window_minutes: row.window_minutes,
    max_changes: row.max_changes,
    package_zh: row.package_zh,
    source_url: row.source_url,
    active: row.active !== false
  };
}

async function uploadJson(sb, filePath, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  const { error } = await sb.storage.from(BUCKET).upload(filePath, bytes, {
    contentType: 'application/json; charset=utf-8',
    upsert: true
  });
  if (error) throw new Error(`upload ${filePath}: ${error.message}`);
  console.log(`  storage ${filePath} ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
  return bytes.length;
}

const env = loadEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const cacheDir = process.env.BUS_FARE_CACHE || path.join(os.tmpdir(), 'transitbuddy-bus-fares');
await mkdir(cacheDir, { recursive: true });
const reuseMs = process.env.BUS_FARE_CACHE ? 30 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;

console.log('Downloading Transport Department route/fare XML');
const routeBus = await download(`${TD_BASE}/ROUTE_BUS.xml`, path.join(cacheDir, 'ROUTE_BUS.xml'), reuseMs);
const fareBus = await download(`${TD_BASE}/FARE_BUS.xml`, path.join(cacheDir, 'FARE_BUS.xml'), reuseMs);
const routeGmb = await download(`${TD_BASE}/ROUTE_GMB.xml`, path.join(cacheDir, 'ROUTE_GMB.xml'), reuseMs);
const fareGmb = await download(`${TD_BASE}/FARE_GMB.xml`, path.join(cacheDir, 'FARE_GMB.xml'), reuseMs);
const updatedCsv = await download(`${TD_BASE}/DATA_LAST_UPDATED_DATE.csv`, path.join(cacheDir, 'DATA_LAST_UPDATED_DATE.csv'), reuseMs);
const tdUpdated = (await readFile(updatedCsv, 'utf8')).trim().split('\n').pop()?.trim() || null;

console.log('Parsing TD routes');
const routeMeta = new Map();
const nBusRoutes = await parseRouteFile(routeBus, routeMeta);
const nGmbRoutes = await parseRouteFile(routeGmb, routeMeta);
console.log('  ROUTE_BUS', nBusRoutes, 'ROUTE_GMB', nGmbRoutes);

console.log('Parsing TD section fares');
const cells = new Map();
const nBusFares = await parseFareFile(fareBus, cells);
const nGmbFares = await parseFareFile(fareGmb, cells);
console.log('  FARE_BUS cells', nBusFares, 'FARE_GMB cells', nGmbFares, 'directions', cells.size);

const fareRoutes = buildFareRoutes(routeMeta, cells, 'td-xml');
console.log('  fare route directions', fareRoutes.length);

console.log('Downloading KMB BBI');
const f1Path = await download(KMB_F1, path.join(cacheDir, 'BBI_routeF1.js'), reuseMs);
const b1Path = await download(KMB_B1, path.join(cacheDir, 'BBI_routeB1.js'), reuseMs);
const kmbF1 = parseKmbBbi(JSON.parse(await readFile(f1Path, 'utf8')), 'kmb-bbi-f1', 'O');
const kmbB1 = parseKmbBbi(JSON.parse(await readFile(b1Path, 'utf8')), 'kmb-bbi-b1', 'I');
console.log('  KMB F1', kmbF1.length, 'B1', kmbB1.length);

console.log('Fetching Citybus BBI pages');
const ctbRows = await fetchCtbBbi();
console.log('  Citybus BBI', ctbRows.length);

const discounts = [...kmbF1, ...kmbB1, ...ctbRows];
const withAmount = discounts.filter((row) => row.discount_amount_hkd != null).length;
console.log('  interchange rows', discounts.length, 'with parsed $', withAmount);

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
console.log('Uploading to Storage bucket', BUCKET);
await ensureBucket(sb);
await uploadJson(sb, 'routes.json', fareRoutes);
const compactRows = discounts.map(compactDiscount);
const shardSize = 12000;
const discountFiles = [];
for (let i = 0; i < compactRows.length; i += shardSize) {
  const name = `discounts-${String(discountFiles.length + 1).padStart(2, '0')}.json`;
  await uploadJson(sb, name, { rows: compactRows.slice(i, i + shardSize) });
  discountFiles.push(name);
}
await uploadJson(sb, 'discounts.json', { files: discountFiles, count: compactRows.length });
await uploadJson(sb, 'meta.json', {
  td_updated: tdUpdated,
  imported_at: new Date().toISOString(),
  fare_routes: fareRoutes.length,
  fare_cells: nBusFares + nGmbFares,
  discounts: discounts.length,
  discount_with_amount: withAmount,
  sources: {
    section_fares: `${TD_BASE}/FARE_BUS.xml`,
    gmb_section_fares: `${TD_BASE}/FARE_GMB.xml`,
    kmb_bbi_f1: KMB_F1,
    kmb_bbi_b1: KMB_B1,
    citybus_bbi: CTB_TC
  }
});

if (await tableExists(sb, 'bus_fare_routes')) {
  console.log('Upserting bus_fare_routes');
  await upsertBatches(sb, 'bus_fare_routes', fareRoutes, 'route_id,route_seq', 80);
} else {
  console.log('bus_fare_routes missing — data is in Storage. Run supabase/migrations/20260816140000_bus_section_fares_and_bbi.sql then re-run this script.');
}

if (await tableExists(sb, 'bus_interchange_discounts')) {
  console.log('Upserting bus_interchange_discounts');
  await upsertBatches(sb, 'bus_interchange_discounts', discounts, 'id', 300);
} else {
  console.log('bus_interchange_discounts missing — data is in Storage. Run the same SQL then re-run this script.');
}

const sample960 = fareRoutes.filter((row) => row.company_code.includes('KMB') && row.route_name === '960');
const sampleBbi = discounts.filter((row) => row.from_route === '960' && row.to_route === '961').slice(0, 3);
console.log('ok import', fareRoutes.length, 'fare directions', discounts.length, 'interchange rows');
if (sample960.length) {
  console.log('sample KMB 960', sample960.map((row) => ({
    bound: row.bound,
    full: row.full_fare_hkd,
    stages: row.section_prices,
    stops: row.stop_count
  })));
}
if (sampleBbi.length) {
  console.log('sample 960→961', sampleBbi.map((row) => ({
    type: row.discount_type,
    amount: row.discount_amount_hkd,
    window: row.window_minutes,
    at: row.interchange_zh
  })));
}
