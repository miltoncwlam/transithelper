export const dynamic = 'force-dynamic';

import { fareForRoute, getFareIndex } from '@/00-required/fares.js';
import { json } from '@/lib/http.js';

export async function GET(request) {
  try {
    const fareIndex = await getFareIndex();
    const url = new URL(request.url);
    const route = url.searchParams.get('route');
    const co = url.searchParams.get('co') || '';
    const bound = url.searchParams.get('bound') || '';
    const on = url.searchParams.get('on');
    const off = url.searchParams.get('off');
    if (route) {
      const fare = await fareForRoute({
        route,
        co,
        bound,
        orig_tc: url.searchParams.get('orig') || '',
        dest_tc: url.searchParams.get('dest') || ''
      }, on, off);
      return json({
        route,
        co: co || null,
        bound: bound || null,
        on: on == null || on === '' ? null : Number(on),
        off: off == null || off === '' ? null : Number(off),
        fare,
        routes: fareIndex.size
      });
    }
    let count = 0;
    for (const rows of fareIndex.values()) count += rows.length;
    return json({ routes: count, names: fareIndex.size });
  } catch (error) {
    return json({ error: error.message, routes: 0 }, 502);
  }
}
