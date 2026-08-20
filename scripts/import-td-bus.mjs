#!/usr/bin/env node
/**
 * Import Transport Department bus GeoJSON (routes, stops, full fares)
 * into the TransitBuddy Supabase project (Storage, and tables if they exist).
 *
 * Usage: node scripts/import-td-bus.mjs /Users/milton/Downloads/JSON_BUS.json
 */
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const SOURCE = process.argv[2] || '/Users/milton/Downloads/JSON_BUS.json';
const BUCKET = 'td-bus';

function loadEnv(text) {
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function boundFromSeq(seq) {
  return Number(seq) === 2 ? 'I' : 'O';
}

function parseFeatures(raw) {
  const routeMap = new Map();
  const stops = [];
  for (const feature of raw.features || []) {
    const p = feature?.properties || {};
    const coords = feature?.geometry?.coordinates || [];
    const routeId = Number(p.routeId);
    const routeSeq = Number(p.routeSeq) || 1;
    const routeName = String(p.routeNameC || p.routeNameE || '');
    const fare = p.fullFare == null ? null : Number(p.fullFare);
    if (!routeId || !routeName || fare == null) continue;
    const key = `${routeId}|${routeSeq}`;
    if (!routeMap.has(key)) {
      routeMap.set(key, {
        route_id: routeId,
        route_seq: routeSeq,
        bound: boundFromSeq(routeSeq),
        company_code: String(p.companyCode || ''),
        route_name: routeName,
        route_name_en: String(p.routeNameE || p.routeNameC || ''),
        service_mode: p.serviceMode || null,
        special_type: p.specialType == null ? null : Number(p.specialType),
        journey_time_minutes: p.journeyTime == null ? null : Number(p.journeyTime),
        full_fare_hkd: fare,
        orig_zh: p.locStartNameC || null,
        orig_en: p.locStartNameE || null,
        dest_zh: p.locEndNameC || null,
        dest_en: p.locEndNameE || null,
        hyperlink_zh: p.hyperlinkC || null,
        hyperlink_en: p.hyperlinkE || null,
        last_update: p.lastUpdateDate ? String(p.lastUpdateDate).slice(0, 10) : null,
        stop_count: 0
      });
    }
    routeMap.get(key).stop_count += 1;
    const stopId = Number(p.stopId);
    const stopSeq = Number(p.stopSeq);
    if (!stopId || !stopSeq) continue;
    stops.push({
      route_id: routeId,
      route_seq: routeSeq,
      stop_seq: stopSeq,
      stop_id: stopId,
      stop_name_zh: p.stopNameC || null,
      stop_name_en: p.stopNameE || null,
      district: p.district || null,
      pick_drop: p.stopPickDrop == null ? null : Number(p.stopPickDrop),
      lng: Number.isFinite(Number(coords[0])) ? Number(coords[0]) : null,
      lat: Number.isFinite(Number(coords[1])) ? Number(coords[1]) : null
    });
  }
  return { routes: [...routeMap.values()], stops };
}

async function tableExists(sb, table) {
  const { error } = await sb.from(table).select('*').limit(1);
  return !error;
}

async function upsertBatches(sb, table, rows, onConflict, chunk = 400) {
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await sb.from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`${table} upsert ${i}: ${error.message}`);
    console.log(`  ${table} ${Math.min(i + slice.length, rows.length)}/${rows.length}`);
  }
}

async function ensureBucket(sb) {
  const { data, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);
  if ((data || []).some((row) => row.id === BUCKET || row.name === BUCKET)) return;
  const created = await sb.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '50MB'
  });
  if (created.error && !/already exists/i.test(created.error.message || '')) {
    throw new Error(`createBucket: ${created.error.message}`);
  }
}

async function uploadJson(sb, path, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/json; charset=utf-8',
    upsert: true
  });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  console.log(`  storage ${path} ${bytes.length} bytes`);
}

const env = loadEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
console.log('Reading', SOURCE);
const raw = JSON.parse((await readFile(SOURCE, 'utf8')).replace(/^\uFEFF/, ''));
const { routes, stops } = parseFeatures(raw);
console.log(raw.features?.length || 0, 'features →', routes.length, 'route directions,', stops.length, 'stops');

console.log('Uploading to Storage bucket', BUCKET);
await ensureBucket(sb);
await uploadJson(sb, 'routes.json', routes);
await uploadJson(sb, 'stops.json', stops);
await uploadJson(sb, 'meta.json', {
  source: 'JSON_BUS.json',
  imported_at: new Date().toISOString(),
  routes: routes.length,
  stops: stops.length,
  companies: [...new Set(routes.map((row) => row.company_code))].sort()
});

if (await tableExists(sb, 'td_bus_routes')) {
  console.log('Tables present — upserting rows');
  await upsertBatches(sb, 'td_bus_routes', routes, 'route_id,route_seq');
  if (await tableExists(sb, 'td_bus_stops')) {
    await upsertBatches(sb, 'td_bus_stops', stops, 'route_id,route_seq,stop_seq');
  }
} else {
  console.log('td_bus_routes table not created yet; data is in Storage. Run supabase/migrations/20260816120000_td_bus.sql then re-run this script to copy into tables.');
}

const sample = routes.filter((row) => row.company_code === 'KMB' && row.route_name === '1');
console.log('ok import', routes.length, 'routes', stops.length, 'stops');
if (sample.length) console.log('sample KMB 1', sample.map((row) => ({ fare: row.full_fare_hkd, mins: row.journey_time_minutes, seq: row.route_seq, stops: row.stop_count })));
