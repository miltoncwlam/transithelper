/** Same-origin APIs for GitHub / Vercel. Never point production at localhost. */
function publicApiBase() {
  const raw = String(process.env.NEXT_PUBLIC_API_BASE || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  try {
    const host = new URL(raw).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return '';
  } catch {
    return '';
  }
  return raw;
}

export const API_BASE = publicApiBase();
export const SHOW_LOCAL_DEV_HINT = process.env.NEXT_PUBLIC_LOCAL_DEV === '1';
export const LOCAL_CONNECTION_REFUSED = {
  zh: process.env.NEXT_PUBLIC_CONNECTION_REFUSED_ZH || '',
  en: process.env.NEXT_PUBLIC_CONNECTION_REFUSED_EN || ''
};
