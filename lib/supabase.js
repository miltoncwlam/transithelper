import { createClient } from '@supabase/supabase-js';

function projectUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

export function getSupabase() {
  const url = projectUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/** Server-only client. Never expose SUPABASE_SECRET_KEY to the browser. */
export function getSupabaseAdmin() {
  const url = projectUrl();
  const key = process.env.SUPABASE_SECRET_KEY || '';
  if (url && key) {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return getSupabase();
}
