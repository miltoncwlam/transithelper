import { createClient } from '@supabase/supabase-js';

function projectUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
}

function anonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY
    || '';
}

export function getSupabase() {
  const url = projectUrl();
  const key = anonKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/** Server-only client. Never expose SUPABASE_SERVICE_ROLE_KEY to the browser. */
export function getSupabaseAdmin() {
  const url = projectUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (url && key) {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return getSupabase();
}
