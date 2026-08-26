import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../00-required/supabase.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'homes.json');

async function readStore() {
  try {
    const raw = await readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

function sortHomes(rows) {
  return [...rows].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || new Date(b.createdAt) - new Date(a.createdAt));
}

function fromRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at || row.createdAt,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle || '',
    payload: row.payload,
    pinned: !!row.pinned
  };
}

export async function listHomes(deviceId) {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('saved_homes')
      .select('*')
      .eq('device_id', deviceId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (!error) return (data || []).map(fromRow);
  }
  try {
    const store = await readStore();
    return sortHomes(store[deviceId] || []);
  } catch {
    return [];
  }
}

export async function addHome(deviceId, item) {
  const next = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    type: item.type,
    title: item.title,
    subtitle: item.subtitle || '',
    payload: item.payload,
    pinned: false
  };
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb.from('saved_homes').insert({
      id: next.id,
      device_id: deviceId,
      type: next.type,
      title: next.title,
      subtitle: next.subtitle,
      payload: next.payload,
      pinned: false
    }).select('*').single();
    if (!error && data) return fromRow(data);
  }
  try {
    const store = await readStore();
    store[deviceId] = [next, ...(store[deviceId] || [])].slice(0, 40);
    await writeStore(store);
    return next;
  } catch {
    const err = new Error('local_only');
    err.localOnly = true;
    throw err;
  }
}

export async function removeHome(deviceId, id) {
  const sb = getSupabaseAdmin();
  if (sb) {
    await sb.from('saved_homes').delete().eq('device_id', deviceId).eq('id', id);
    return { ok: true };
  }
  try {
    const store = await readStore();
    const before = store[deviceId] || [];
    store[deviceId] = before.filter((item) => item.id !== id);
    await writeStore(store);
  } catch {
    return { ok: true, localOnly: true };
  }
  return { ok: true };
}

export async function pinHome(deviceId, id, pinned) {
  const sb = getSupabaseAdmin();
  if (sb) {
    const { data, error } = await sb
      .from('saved_homes')
      .update({ pinned: !!pinned })
      .eq('device_id', deviceId)
      .eq('id', id)
      .select('*')
      .single();
    if (!error && data) return fromRow(data);
  }
  try {
    const store = await readStore();
    store[deviceId] = (store[deviceId] || []).map((item) => item.id === id ? { ...item, pinned: !!pinned } : item);
    await writeStore(store);
    return sortHomes(store[deviceId] || []).find((item) => item.id === id) || { ok: true };
  } catch {
    return { ok: true, localOnly: true, id, pinned: !!pinned };
  }
}
