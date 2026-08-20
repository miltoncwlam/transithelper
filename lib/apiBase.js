/** Same-origin APIs for GitHub / Vercel. Do not point this at localhost. */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
export const SHOW_LOCAL_DEV_HINT = process.env.NEXT_PUBLIC_LOCAL_DEV === '1';
export const LOCAL_CONNECTION_REFUSED = {
  zh: process.env.NEXT_PUBLIC_CONNECTION_REFUSED_ZH || '',
  en: process.env.NEXT_PUBLIC_CONNECTION_REFUSED_EN || ''
};
