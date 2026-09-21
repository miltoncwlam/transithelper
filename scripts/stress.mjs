#!/usr/bin/env node
/**
 * Stress test: hammer the local server the way the app does and report
 * latency / error rates. Run a server first (`npm run start` or `npm run dev`),
 * then: `node scripts/stress.mjs` (STRESS_BASE=http://localhost:3001 default).
 *
 * Phases:
 *   A static+directory — cheap cacheable GETs at high concurrency.
 *   B planner          — POST /api/journey-options with real OD pairs.
 *   C ride+transfer    — POST /api/ride and /api/transfer with a real route.
 *   D stampede         — 20 simultaneous identical /api/ride (auto-refresh burst).
 *
 * Exit 1 on: any 5xx, transport error rate > 2%, or directory p95 > 2000ms.
 * Empty planner results (no live buses) are reported, not failed.
 */

const BASE = (process.env.STRESS_BASE || 'http://localhost:3001').replace(/\/$/, '');

const stats = [];
function record(phase, ms, ok, note) {
  stats.push({ phase, ms, ok, note });
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function report(phase) {
  const rows = stats.filter((s) => s.phase === phase);
  const times = rows.map((s) => s.ms);
  const errors = rows.filter((s) => !s.ok);
  return {
    n: rows.length,
    errors: errors.length,
    p50: Math.round(percentile(times, 50)),
    p95: Math.round(percentile(times, 95)),
    max: Math.round(Math.max(0, ...times)),
    notes: errors.slice(0, 3).map((e) => e.note)
  };
}

async function hit(phase, path, { method = 'GET', body, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const kill = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      cache: 'no-store',
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'X-Device-Id': 'stress-test',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const ms = performance.now() - started;
    if (res.status >= 500) {
      record(phase, ms, false, `HTTP ${res.status}`);
      return null;
    }
    const json = await res.json().catch(() => ({}));
    record(phase, ms, res.ok, res.ok ? undefined : `HTTP ${res.status}`);
    return json;
  } catch (e) {
    record(phase, performance.now() - started, false, e.name === 'AbortError' ? `timeout>${timeoutMs}ms` : String(e.message || e));
    return null;
  } finally {
    clearTimeout(kill);
  }
}

async function pool(items, limit, fn) {
  const queue = [...items];
  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      if (item !== undefined) await fn(item);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

function stopsNamed(stops, keyword, cap = 3) {
  return stops.filter((s) => (s.name_tc || '').includes(keyword) || (s.name_en || '').toLowerCase().includes(keyword.toLowerCase())).slice(0, cap);
}

async function main() {
  console.log(`stress target: ${BASE}`);
  const ping = await fetch(`${BASE}/api/kmb/routes`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!ping?.ok) {
    console.error('server not reachable — start one first (npm run start)');
    process.exit(2);
  }

  // Real data for realistic payloads.
  const stopsJson = await (await fetch(`${BASE}/api/kmb/stops`)).json();
  const allStops = stopsJson.data || [];
  console.log(`directory: ${allStops.length} stops`);

  const seqJson = await (await fetch(`${BASE}/api/kmb/route-stop/1/O/1`)).json();
  const seq = seqJson.data || [];
  const first = { route: '1', co: 'KMB', bound: 'O', service_type: '1' };
  const boardIds = seq.length ? [seq[0].stop] : [];
  const midIds = seq.length > 4 ? [seq[Math.floor(seq.length / 2)].stop] : boardIds;
  const destIds = seq.length > 2 ? [seq[seq.length - 1].stop] : boardIds;

  const odPairs = [
    { originStops: stopsNamed(allStops, '竹園邨總站'), destinationStops: stopsNamed(allStops, '尖沙咀碼頭'), nearby: true, radius: 250 },
    { originStops: stopsNamed(allStops, '第一城總站'), destinationStops: stopsNamed(allStops, '太子站'), nearby: true, radius: 250 }
  ].filter((p) => p.originStops.length && p.destinationStops.length);
  console.log(`planner pairs: ${odPairs.length}`);

  // A — static + directory burst
  await pool(Array.from({ length: 150 }, (_, i) => i), 15, async (i) => {
    const path = i % 3 === 0 ? '/standalone.html' : (i % 3 === 1 ? '/api/kmb/routes' : '/api/kmb/stops');
    await hit('A static/directory', path, { timeoutMs: 15000 });
  });
  console.log('A static/directory', report('A static/directory'));

  // B — planner
  await pool(Array.from({ length: 24 }, (_, i) => odPairs[i % odPairs.length]), 4, async (body) => {
    const json = await hit('B planner', '/api/journey-options', { method: 'POST', body, timeoutMs: 45000 });
    if (json) record('B planner options', 0, true, String((json.options || []).length));
  });
  const plannerReport = report('B planner');
  const optionCounts = stats.filter((s) => s.phase === 'B planner options').map((s) => +s.note);
  const emptyPlanner = optionCounts.filter((c) => c === 0).length;
  console.log('B planner', plannerReport, `empty=${emptyPlanner}/${optionCounts.length}`);

  // C — ride + transfer
  await pool(Array.from({ length: 30 }, (_, i) => i), 5, async (i) => {
    if (i % 2 === 0) {
      await hit('C ride/transfer', '/api/ride', {
        method: 'POST',
        body: { first, boardStops: boardIds, destStops: destIds },
        timeoutMs: 35000
      });
    } else {
      await hit('C ride/transfer', '/api/transfer', {
        method: 'POST',
        body: { phase: 'departures', nearby: true, radius: 250, first, boardStops: boardIds, interchangeStops: midIds, destinationStops: destIds },
        timeoutMs: 35000
      });
    }
  });
  console.log('C ride/transfer', report('C ride/transfer'));

  // D — stampede: 20 simultaneous identical rides (auto-refresh burst)
  await pool(Array.from({ length: 20 }, (_, i) => i), 20, async () => {
    await hit('D stampede', '/api/ride', {
      method: 'POST',
      body: { first, boardStops: boardIds, destStops: destIds },
      timeoutMs: 35000
    });
  });
  console.log('D stampede', report('D stampede'));

  // Verdict
  const failed = stats.filter((s) => !s.ok);
  const serverErrors = failed.filter((s) => /HTTP 5/.test(s.note || ''));
  const dirP95 = report('A static/directory').p95;
  const errorRate = failed.length / Math.max(1, stats.length);
  console.log(`\ntotal=${stats.length} errors=${failed.length} (${(errorRate * 100).toFixed(1)}%) 5xx=${serverErrors.length} dirP95=${dirP95}ms`);
  if (serverErrors.length) {
    console.error('FAIL: 5xx responses seen', serverErrors.slice(0, 5));
    process.exit(1);
  }
  if (errorRate > 0.02) {
    console.error('FAIL: error rate above 2%');
    process.exit(1);
  }
  if (dirP95 > 2000) {
    console.error('FAIL: directory p95 above 2000ms');
    process.exit(1);
  }
  console.log('PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
