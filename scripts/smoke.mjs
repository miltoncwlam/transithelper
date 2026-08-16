#!/usr/bin/env node
/**
 * API smoke checks for Transit Buddy.
 * If this prints ECONNREFUSED, nothing is listening on port 3001 —
 * run `npm run dev` in this folder, then retry. That is not a frontend bug.
 */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3001';

async function get(path) {
  const res = await fetch(BASE + path, {
    headers: { 'X-Device-Id': 'smoke-device', Accept: 'application/json' },
    signal: AbortSignal.timeout(60000)
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function fail(msg) {
  console.error('FAIL', msg);
  process.exitCode = 1;
}

try {
  const status = await get('/api/status');
  if (!status.ok || !status.json.routes) fail(`/api/status ${status.status} ${JSON.stringify(status.json)}`);
  else console.log('ok status', status.json.routes, 'routes', status.json.stops, 'stops');

  const tst = await get('/api/mtr/schedule?line=TWL&sta=TST');
  if (!tst.ok) fail(`MTR TST HTTP ${tst.status}`);
  else if (!(tst.json.trains || []).length) fail('MTR TST returned no trains');
  else console.log('ok MTR Tsuen Wan line Tsim Sha Tsui', tst.json.trains.length, 'trains', tst.json.trains[0]?.dest);

  const two = await get('/api/mtr/schedule?line=EAL&sta=TWO');
  if (!two.ok) fail(`MTR TWO HTTP ${two.status}`);
  else if (!(two.json.trains || []).length) fail('MTR Tai Wo returned no trains');
  else console.log('ok MTR East Rail Tai Wo', two.json.trains.length, 'trains');

  const rac = await get('/api/mtr/schedule?line=EAL&sta=RAC');
  if (!rac.ok) fail(`MTR RAC HTTP ${rac.status}`);
  else if ((rac.json.trains || []).length) console.log('ok MTR Racecourse has trains today');
  else if (rac.json.emptyReason !== 'racecourse' && rac.json.emptyReason !== 'empty') fail(`MTR Racecourse unexpected ${JSON.stringify(rac.json)}`);
  else console.log('ok MTR Racecourse emptyReason', rac.json.emptyReason);

  const eta = await get('/api/kmb/route-eta/1/1');
  if (!eta.ok) fail(`KMB route-eta ${eta.status}`);
  else console.log('ok KMB route 1 etas', (eta.json.data || []).length);

  const home = await fetch(`${BASE}/`);
  if (!home.ok) fail(`home ${home.status}`);
  else console.log('ok home', home.status);

  const html = await fetch(`${BASE}/standalone.html`);
  if (!html.ok) fail(`standalone ${html.status}`);
  else console.log('ok standalone', html.status);

  if (process.exitCode) console.error('Smoke finished with failures.');
  else console.log('Smoke passed.');
} catch (error) {
  if (error.cause?.code === 'ECONNREFUSED' || error.message?.includes('fetch failed') || error.code === 'ECONNREFUSED') {
    console.error('ECONNREFUSED: nothing is listening on', BASE);
    console.error('Run `npm run dev` in the project folder, then retry. This is not a frontend bug.');
  } else {
    console.error(error);
  }
  process.exit(1);
}
