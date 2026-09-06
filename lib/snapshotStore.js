/** L1: process tmpdir. L2: Supabase Storage bucket, so Vercel instances share a warm graph. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getSupabaseAdmin } from '../00-required/supabase.js';

export const SNAPSHOT_BUCKET = 'transitbuddy-cache';

const timers = new Map();

function tmpPath(name) {
  return path.join(os.tmpdir(), name);
}

export async function readSnapshot(name) {
  try {
    const raw = JSON.parse(await readFile(tmpPath(name), 'utf8'));
    if (raw && typeof raw === 'object') return raw;
  } catch {}
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb.storage.from(SNAPSHOT_BUCKET).download(name);
    if (error || !data) return null;
    const raw = JSON.parse(await data.text());
    if (!raw || typeof raw !== 'object') return null;
    await writeSnapshotLocal(name, raw).catch(() => {});
    return raw;
  } catch {
    return null;
  }
}

async function writeSnapshotLocal(name, value) {
  await mkdir(os.tmpdir(), { recursive: true });
  await writeFile(tmpPath(name), JSON.stringify(value));
}

async function uploadSnapshot(name, value) {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const bytes = Buffer.from(JSON.stringify(value));
  await sb.storage.from(SNAPSHOT_BUCKET).upload(name, bytes, {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '120'
  });
}

export async function writeSnapshot(name, value, opts = {}) {
  try {
    await writeSnapshotLocal(name, value);
  } catch {}
  if (opts.remote === false) return;
  const prev = timers.get(name);
  if (prev) clearTimeout(prev);
  if (opts.remoteImmediately) {
    timers.delete(name);
    await uploadSnapshot(name, value).catch(() => {});
    return;
  }
  timers.set(name, setTimeout(() => {
    timers.delete(name);
    uploadSnapshot(name, value).catch(() => {});
  }, Number(opts.delayMs) || 8000));
}

export async function flushSnapshots() {
  const pending = [...timers.entries()];
  timers.clear();
  for (const [, timer] of pending) clearTimeout(timer);
}
