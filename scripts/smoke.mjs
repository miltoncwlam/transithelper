#!/usr/bin/env node
/**
 * API smoke checks for Transit Buddy.
 * If this prints ECONNREFUSED, nothing is listening on port 3001 —
 * run `npm run dev` in this folder, then retry. That is not a frontend bug.
 */
import { compareRouteMatches } from '../lib/routeSearch.js';

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3001';

async function get(path) {
  const res = await fetch(BASE + path, {
    headers: { 'X-Device-Id': 'smoke-device', Accept: 'application/json' },
    signal: AbortSignal.timeout(60000)
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'X-Device-Id': 'smoke-device', Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  if (compareRouteMatches('81', '81', '81A') >= 0) fail('search rank: live-first exact 81 should sort above 81A');
  else if (compareRouteMatches('81', '81A', '181') >= 0) fail('search rank: 81A should sort above 181 for query 81');
  else console.log('ok route search rank 81 > 81A > 181');

  const statusT0 = Date.now();
  const status = await get('/api/status');
  const statusMs = Date.now() - statusT0;
  if (!status.ok || typeof status.json.routes !== 'number') fail(`/api/status ${status.status} ${JSON.stringify(status.json)}`);
  else if (statusMs > 8000) fail(`/api/status too slow ${statusMs}ms`);
  else console.log('ok status', status.json.routes, 'routes', status.json.stops, 'stops', status.json.citybusStops || 0, 'citybusStops', statusMs + 'ms');

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

  const tstAdm = await get('/api/mtr/schedule?line=TWL&sta=TST&dest=ADM');
  if (!tstAdm.ok) fail(`MTR TST dest ADM HTTP ${tstAdm.status}`);
  else if ((tstAdm.json.trains || []).some((train) => train.destCode === 'TSW')) fail(`MTR TST dest ADM still listed Tsuen Wan trains ${JSON.stringify(tstAdm.json.trains)}`);
  else if ((tstAdm.json.trains || []).length && (tstAdm.json.trains || []).some((train) => !train.arrive)) fail('MTR TST dest ADM missing arrive');
  else if ((tstAdm.json.trains || []).length && (tstAdm.json.trains || []).some((train) => !Array.isArray(train.stops) || train.stops.length < 2)) fail('MTR TST dest ADM missing stop times');
  else console.log('ok MTR TST dest ADM', (tstAdm.json.trains || []).length, 'trains', tstAdm.json.emptyReason || 'live');

  const tikPoa = await get('/api/mtr/schedule?line=TKL&sta=TIK&dest=POA');
  if (!tikPoa.ok) fail(`MTR TIK dest POA HTTP ${tikPoa.status}`);
  else if ((tikPoa.json.trains || []).some((train) => train.destCode === 'LHP')) fail('MTR TIK dest POA listed LOHAS Park trains');
  else console.log('ok MTR TIK dest POA', (tikPoa.json.trains || []).length, 'trains', tikPoa.json.emptyReason || 'live');

  const hokTsy = await get('/api/mtr/schedule?line=AEL&sta=HOK&dest=TSY');
  if (!hokTsy.ok) fail(`MTR HOK dest TSY HTTP ${hokTsy.status}`);
  else {
    const trains = hokTsy.json.trains || [];
    const ael = trains.find((train) => train.line === 'AEL');
    const tcl = trains.find((train) => train.line === 'TCL');
    if (ael && (ael.stops || []).length !== 3) fail(`MTR AEL HOK-TSY should be 3 stations, got ${(ael.stops || []).length}`);
    else if (tcl && (tcl.stops || []).length !== 6) fail(`MTR TCL HOK-TSY should be 6 stations, got ${(tcl.stops || []).length}`);
    else if (ael && tcl && ael.rideMinutes != null && tcl.rideMinutes != null && ael.rideMinutes > tcl.rideMinutes) fail(`MTR HOK-TSY AEL slower than TCL ${ael.rideMinutes} > ${tcl.rideMinutes}`);
    else console.log('ok MTR HOK dest TSY', trains.length, 'trains', ael ? `AEL ${ael.rideMinutes} min` : 'no AEL', tcl ? `TCL ${tcl.rideMinutes} min` : 'no TCL');
  }

  const kowHok = await get('/api/mtr/schedule?line=AEL&sta=KOW&dest=HOK');
  if (!kowHok.ok) fail(`MTR KOW dest HOK HTTP ${kowHok.status}`);
  else {
    const ael = (kowHok.json.trains || []).filter((train) => train.line === 'AEL' && train.destCode === 'HOK');
    if (ael.length && ael.some((train) => !Array.isArray(train.stops) || train.stops.length !== 2)) {
      fail(`MTR AEL KOW dest HOK should be 2 stations, got ${JSON.stringify(ael.map((train) => (train.stops || []).map((stop) => stop.stop)))}`);
    } else console.log('ok MTR KOW dest HOK', (kowHok.json.trains || []).length, 'trains', ael[0] ? `AEL ${(ael[0].stops || []).map((stop) => stop.stop).join('-')}` : 'no AEL now');
  }

  const kowAwe = await get('/api/mtr/schedule?line=AEL&sta=KOW&dest=AWE');
  if (!kowAwe.ok) fail(`MTR KOW dest AWE HTTP ${kowAwe.status}`);
  else {
    const ael = (kowAwe.json.trains || []).filter((train) => train.line === 'AEL' && train.destCode === 'AWE');
    if (ael.length && ael.some((train) => !Array.isArray(train.stops) || train.stops.length !== 4)) {
      fail(`MTR AEL KOW dest AWE should be 4 stations, got ${JSON.stringify(ael.map((train) => (train.stops || []).map((stop) => stop.stop)))}`);
    } else console.log('ok MTR KOW dest AWE', (kowAwe.json.trains || []).length, 'trains', ael[0] ? `AEL ${(ael[0].stops || []).map((stop) => stop.stop).join('-')}` : 'no AEL now');
  }

  const hokHok = await get('/api/mtr/schedule?line=AEL&sta=HOK&dest=HOK');
  if (!hokHok.ok) fail(`MTR HOK dest HOK HTTP ${hokHok.status}`);
  else if ((hokHok.json.trains || []).some((train) => !train.terminus || (train.stops || []).length > 1)) {
    fail(`MTR HOK dest HOK should be terminus-only, got ${JSON.stringify(hokHok.json.trains)}`);
  } else console.log('ok MTR HOK dest HOK terminus', (hokHok.json.trains || []).length, 'trains', hokHok.json.emptyReason || 'terminus');

  const eta = await get('/api/kmb/route-eta/1/1');
  if (!eta.ok) fail(`KMB route-eta ${eta.status}`);
  else console.log('ok KMB route 1 etas', (eta.json.data || []).length);

  const nearby = await get('/api/stops/nearby?lat=22.2975&lng=114.1722&radius=250');
  if (!nearby.ok) fail(`nearby ${nearby.status}`);
  else if (!(nearby.json.data || []).length) fail('nearby TST returned no stops');
  const nearbyWide = await get('/api/stops/nearby?lat=22.2975&lng=114.1722&radius=600&limit=80');
  if (!nearbyWide.ok) fail(`nearby wide ${nearbyWide.status}`);
  else console.log('ok nearby wide TST', nearbyWide.json.data.length, 'stops');

  const nlbStops = await get('/api/nlb/route-stop/1');
  if (!nlbStops.ok) fail(`nlb route-stop HTTP ${nlbStops.status}`);
  else if (!(nlbStops.json.data || []).length) fail('nlb 1 returned no stops');
  else console.log('ok NLB 1', nlbStops.json.data.length, 'stops', nlbStops.json.data[0]?.name_tc || nlbStops.json.data[0]?.name_en);

  const lrt = await get('/api/mtr/schedule?line=LRT&sta=1');
  if (!lrt.ok) fail(`LRT HTTP ${lrt.status}`);
  else if (!(lrt.json.trains || []).length && lrt.json.emptyReason !== 'empty' && lrt.json.emptyReason !== 'unavailable') fail(`LRT unexpected ${JSON.stringify(lrt.json)}`);
  else {
    const trains = lrt.json.trains || [];
    if (trains.some((train) => !train.time || train.minutes == null || Number.isNaN(Number(train.minutes)))) {
      fail(`LRT missing time/minutes ${JSON.stringify(trains.slice(0, 2))}`);
    } else console.log('ok Light Rail Tuen Mun Ferry Pier', trains.length, 'trains', lrt.json.emptyReason || 'live');
  }

  const gmbLookup = await get('/api/gmb/lookup?route=811');
  if (!gmbLookup.ok) fail(`gmb 811 HTTP ${gmbLookup.status}`);
  else if (!(gmbLookup.json.data || []).length) fail('gmb 811 lookup empty');
  else if ((gmbLookup.json.data || []).some((row) => row.co !== 'GMB')) fail('gmb 811 mislabelled');
  else console.log('ok GMB 811', gmbLookup.json.data.length, 'services', gmbLookup.json.data[0]?.gmb_region, gmbLookup.json.data[0]?.orig_tc, '→', gmbLookup.json.data[0]?.dest_tc);

  const discounts = await get('/api/discounts');
  if (!discounts.ok) fail(`discounts ${discounts.status}`);
  else console.log('ok discounts', discounts.json.count, 'rows', discounts.json.pairs, 'pairs');

  const bbi = await get('/api/discounts?from=960&to=961');
  if (!bbi.ok) fail(`discounts 960-961 ${bbi.status}`);
  else if (bbi.json.match && bbi.json.match.discount_amount_hkd == null && bbi.json.match.discount_type !== 'free') fail(`discounts 960-961 missing amount ${JSON.stringify(bbi.json.match)}`);
  else console.log('ok discounts 960→961', bbi.json.match?.discount_type, bbi.json.match?.discount_amount_hkd, bbi.json.count, 'rows');

  const fares = await get('/api/fares?route=1&co=KMB');
  if (!fares.ok) fail(`fares HTTP ${fares.status}`);
  else if (!fares.json.fare || fares.json.fare.full_fare_hkd == null) fail(`fares missing KMB 1 ${JSON.stringify(fares.json)}`);
  else console.log('ok fares KMB 1', fares.json.fare.full_fare_hkd, 'hkd', fares.json.fare.journey_time_minutes, 'min');

  const section = await get('/api/fares?route=960&co=KMB&bound=O&on=15&off=22');
  if (!section.ok) fail(`fares 960 HTTP ${section.status}`);
  else if (section.json.fare?.section_prices?.length > 1 && section.json.fare.section_fare_hkd == null) fail(`fares 960 missing section ${JSON.stringify(section.json.fare)}`);
  else console.log('ok fares KMB 960', section.json.fare?.full_fare_hkd, 'full', section.json.fare?.section_fare_hkd, 'section', (section.json.fare?.section_prices || []).join('/'));

  let ctbStops = await get('/api/citybus/route-stop/962/outbound');
  if (ctbStops.ok && !(ctbStops.json.data || []).length) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    ctbStops = await get('/api/citybus/route-stop/962/outbound');
  }
  if (!ctbStops.ok) fail(`citybus 962 HTTP ${ctbStops.status}`);
  else if ((ctbStops.json.data || []).length) {
    if (!(ctbStops.json.data[0].name_tc || ctbStops.json.data[0].name_en)) fail('citybus 962 stop has no name');
    else if (String(ctbStops.json.data[0].name_tc || '') === String(ctbStops.json.data[0].stop)) fail('citybus 962 stop still showing id as name');
    else console.log('ok citybus 962', ctbStops.json.data.length, 'stops', ctbStops.json.data[0].name_tc || ctbStops.json.data[0].name_en);
  } else if (!(status.json.citybusStops > 0)) fail('citybus 962 returned no stops and directory has no named Citybus stops');
  else console.log('ok citybus 962 empty from upstream, directory has', status.json.citybusStops, 'named Citybus stops');

  const ctbEta = await get('/api/citybus/stop-eta/001939');
  if (!ctbEta.ok) fail(`citybus stop-eta HTTP ${ctbEta.status}`);
  else console.log('ok citybus stop-eta Lung Mun Oasis', (ctbEta.json.data || []).length);

  const incomplete = await post('/api/transfer', { phase: 'departures' });
  if (!incomplete.ok) fail(`transfer incomplete HTTP ${incomplete.status}`);
  else if (incomplete.json.emptyReason !== 'incomplete' || incomplete.json.phase !== 'departures') fail(`transfer incomplete ${JSON.stringify(incomplete.json)}`);
  else console.log('ok transfer incomplete');

  const routeStops = await get('/api/kmb/route-stop/1/outbound/1');
  const stopRows = routeStops.json.data || [];
  if (!routeStops.ok || stopRows.length < 3) fail(`route-stop 1 ${routeStops.status} ${stopRows.length}`);
  else {
    const board = stopRows[0];
    const inter = stopRows[Math.min(6, stopRows.length - 2)];
    const dest = stopRows[stopRows.length - 1];
    const departures = await post('/api/transfer', {
      phase: 'departures',
      nearby: false,
      first: { route: '1', bound: 'O', service_type: '1', dest_tc: dest.name_tc, dest_en: dest.name_en },
      boardStops: [board.stop],
      interchangeStops: [inter.stop],
      destinationStops: [dest.stop]
    });
    if (!departures.ok) fail(`transfer departures HTTP ${departures.status}`);
    else if (departures.json.phase !== 'departures') fail(`transfer departures ${JSON.stringify(departures.json)}`);
    else if (!Array.isArray(departures.json.departures) || !Array.isArray(departures.json.directs)) fail(`transfer departures missing arrays ${JSON.stringify(departures.json)}`);
    else console.log('ok transfer departures', departures.json.departures.length, 'trips', departures.json.directs.length, 'directs', departures.json.emptyReason || 'live');

    if (departures.json.departures.length) {
      const connections = await post('/api/transfer', {
        phase: 'connections',
        nearby: false,
        first: { route: '1', bound: 'O', service_type: '1', dest_tc: dest.name_tc, dest_en: dest.name_en },
        boardStops: [board.stop],
        interchangeStops: [inter.stop],
        destinationStops: [dest.stop],
        selectedDeparture: departures.json.departures[0].eta
      });
      if (!connections.ok) fail(`transfer connections HTTP ${connections.status}`);
      else if (connections.json.firstArrivalAtInterchange && !(connections.json.firstStops || []).length) fail(`transfer connections missing firstStops ${JSON.stringify(connections.json)}`);
      else console.log('ok transfer connections', (connections.json.firstStops || []).length, 'firstStops', connections.json.emptyReason || 'live');
    }

    const ride = await post('/api/ride', {
      first: { route: '1', bound: 'O', service_type: '1' },
      boardStops: [board.stop],
      destStops: [inter.stop]
    });
    if (!ride.ok) fail(`ride HTTP ${ride.status}`);
    else if (!Array.isArray(ride.json.trips)) fail(`ride missing trips ${JSON.stringify(ride.json)}`);
    else if (ride.json.trips.length && ride.json.trips.some((trip) => !trip.arrive)) fail(`ride missing arrive ${JSON.stringify(ride.json)}`);
    else if (ride.json.trips.length && ride.json.trips.some((trip) => !Array.isArray(trip.stops) || trip.stops.length < 2)) fail(`ride missing stop times ${JSON.stringify(ride.json)}`);
    else console.log('ok ride', ride.json.trips.length, 'trips', ride.json.emptyReason || 'live');
  }

  const kmbIn = await get('/api/kmb/route-stop/1/inbound/1');
  if (!kmbIn.ok || !(kmbIn.json.data || []).length) fail(`KMB 1 inbound ${kmbIn.status} ${(kmbIn.json.data || []).length}`);
  else if (!(kmbIn.json.data[0].name_tc || kmbIn.json.data[0].name_en)) fail('KMB 1 inbound stop has no name');
  else console.log('ok KMB 1 inbound', kmbIn.json.data.length, 'stops', kmbIn.json.data[0].name_tc);

  const lwbStops = await get('/api/kmb/route-stop/A31/outbound/1');
  if (!lwbStops.ok) fail(`LWB A31 HTTP ${lwbStops.status}`);
  else if (!(lwbStops.json.data || []).length) fail('LWB A31 returned no stops');
  else console.log('ok LWB A31', lwbStops.json.data.length, 'stops', lwbStops.json.data[0]?.name_tc || lwbStops.json.data[0]?.name_en);

  const lwbEta = await get('/api/kmb/route-eta/A31/1');
  if (!lwbEta.ok) fail(`LWB A31 eta ${lwbEta.status}`);
  else console.log('ok LWB A31 etas', (lwbEta.json.data || []).length);

  const ctb1 = await get('/api/citybus/route-stop/1/inbound');
  if (!ctb1.ok) fail(`citybus 1 inbound HTTP ${ctb1.status}`);
  else if ((ctb1.json.data || []).length) {
    const named = (ctb1.json.data || []).filter((row) => (row.name_tc || row.name_en) && String(row.name_tc || '') !== String(row.stop));
    if (!named.length) fail('citybus 1 inbound all stops unnamed');
    else console.log('ok citybus 1 inbound', ctb1.json.data.length, 'stops', named[0].name_tc || named[0].name_en);
  } else console.log('ok citybus 1 inbound empty from upstream');

  const gmb11 = await get('/api/gmb/lookup?route=11');
  if (!gmb11.ok) fail(`gmb 11 HTTP ${gmb11.status}`);
  else if (!(gmb11.json.data || []).length) fail('gmb 11 lookup empty');
  else {
    const row = gmb11.json.data[0];
    if (row.co !== 'GMB' || !row.gmb_route_id) fail(`gmb 11 incomplete ${JSON.stringify(row)}`);
    const gmbStops = await get(`/api/gmb/route-stop/${encodeURIComponent(row.gmb_route_id)}/${encodeURIComponent(row.gmb_route_seq || 1)}`);
    if (!gmbStops.ok || !(gmbStops.json.data || []).length) fail(`gmb 11 stops ${gmbStops.status}`);
    else console.log('ok GMB 11', gmbStops.json.data.length, 'stops', row.gmb_region, row.orig_tc, '→', row.dest_tc);
  }

  const nlbEta = await get('/api/nlb/eta/1/' + encodeURIComponent((nlbStops.json.data || [])[0]?.stop || ''));
  if (!nlbEta.ok) fail(`nlb eta HTTP ${nlbEta.status}`);
  else console.log('ok NLB 1 eta', (nlbEta.json.data || []).length);

  const routesDir = await get('/api/kmb/routes');
  if (!routesDir.ok || !(routesDir.json.data || []).length) fail(`directory routes ${routesDir.status}`);
  else {
    const rows = routesDir.json.data || [];
    const cos = new Set(rows.map((row) => String(row.co || 'KMB').toUpperCase()));
    for (const need of ['KMB', 'CTB', 'GMB', 'NLB']) {
      if (!cos.has(need)) fail(`directory missing ${need}`);
    }
    const hasLwb = cos.has('LWB') || rows.some((row) => /^A\d+|E\d+|NA\d+|S\d+/i.test(String(row.route || '')) && String(row.co || '').toUpperCase() !== 'CTB');
    if (!hasLwb) fail('directory missing LWB / Long Win airport routes');
    console.log('ok directory companies', [...cos].sort().join(','), rows.length, 'services');
  }

  async function checkSearch(route, expectCo, maxMs) {
    const t0 = Date.now();
    const res = await get(`/api/search-live?route=${encodeURIComponent(route)}`);
    const ms = Date.now() - t0;
    const keep = res.json.keep || [];
    const cos = keep.map((z) => String(z.service?.co || '').toUpperCase());
    if (!res.ok) fail(`search-live ${route} HTTP ${res.status} ${JSON.stringify(res.json)}`);
    else if (!cos.includes(expectCo)) fail(`search-live ${route} missing ${expectCo} in ${cos.join(',') || 'empty'} ${JSON.stringify(keep.map((z) => z.service?.route))}`);
    else if (ms > maxMs) fail(`search-live ${route} too slow ${ms}ms`);
    else console.log('ok search-live', route, ms + 'ms', keep.length, 'choices', [...new Set(cos)].join(','));
  }
  await checkSearch('1', 'NLB', 4000);
  await checkSearch('3M', 'NLB', 4000);
  await checkSearch('A35', 'NLB', 4000);

  const search11 = await get('/api/search-live?route=11');
  if (!search11.ok) fail(`search-live 11 HTTP ${search11.status}`);
  else {
    const keep = search11.json.keep || [];
    const hasGmb = keep.some((z) => String(z.service?.co || '').toUpperCase() === 'GMB' && z.service?.gmb_route_id);
    console.log('ok search-live 11', keep.length, 'choices', hasGmb ? 'includes GMB' : 'no GMB (honest empty)');
  }

  async function checkLine(label, body, expectColor) {
    const res = await fetch(BASE + '/api/route-line', {
      method: 'POST',
      headers: { 'X-Device-Id': 'smoke-device', Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) fail(`route-line ${label} HTTP ${res.status} ${JSON.stringify(json)}`);
    else if (!['official', 'osm', 'osrm', 'straight'].includes(json.source)) fail(`route-line ${label} bad source ${json.source}`);
    else if (json.source !== 'straight' && !(json.coords || []).length) fail(`route-line ${label} empty coords for ${json.source}`);
    else if (json.source === 'straight' && (body.stops || []).length >= 2 && (json.coords || []).length < 2) fail(`route-line ${label} straight missing stop polyline`);
    else if (expectColor && json.color !== expectColor) fail(`route-line ${label} color ${json.color} != ${expectColor}`);
    else {
      const coords = json.coords || [];
      let jump = 0;
      let len = 0;
      for (let i = 1; i < coords.length; i += 1) {
        const a = coords[i - 1];
        const b = coords[i];
        const d = Math.hypot((a[0] - b[0]) * 111000, (a[1] - b[1]) * 102000);
        jump = Math.max(jump, d);
        len += d;
      }
      let chain = 0;
      const stops = body.stops || [];
      for (let i = 1; i < stops.length; i += 1) {
        chain += Math.hypot((stops[i].lat - stops[i - 1].lat) * 111000, (stops[i].lng - stops[i - 1].lng) * 102000);
      }
      if (json.source !== 'straight' && jump > 2500) fail(`route-line ${label} jump ${Math.round(jump)}m via ${json.source}`);
      else if (json.source === 'osrm' && chain > 400 && len > chain * 2.55 + 900) fail(`route-line ${label} detour ${Math.round(len)}m vs stops ${Math.round(chain)}m`);
      else if (/^KMB 1|^CTB 1/.test(label) && json.source !== 'official') {
        if (process.env.CI && (json.source === 'straight' || json.source === 'osm' || json.source === 'osrm')) {
          console.log('ok route-line', label, json.source, coords.length, 'pts', '(CI: official CSDI unavailable)');
        } else fail(`route-line ${label} expected official CSDI line, got ${json.source}`);
      }
      else console.log('ok route-line', label, json.source, coords.length, 'pts', json.color, 'maxJump', Math.round(jump) + 'm', 'ratio', chain ? (len / chain).toFixed(2) : 'n/a');
    }
  }

  const kmbLineStops = (stopRows || []).map((stop) => ({ lat: stop.lat, lng: stop.long ?? stop.lng })).filter((p) => p.lat && p.lng);
  await checkLine('KMB 1', {
    route: '1',
    co: 'KMB',
    bound: 'O',
    orig: stopRows[0]?.name_tc || '',
    dest: stopRows[stopRows.length - 1]?.name_tc || '',
    stops: kmbLineStops
  }, '#E1251B');

  const kmbInStops = ((kmbIn.json.data || [])).map((stop) => ({ lat: stop.lat, lng: stop.long ?? stop.lng })).filter((p) => p.lat && p.lng);
  await checkLine('KMB 1 inbound', {
    route: '1',
    co: 'KMB',
    bound: 'I',
    orig: (kmbIn.json.data || [])[0]?.name_tc || '',
    dest: (kmbIn.json.data || []).at(-1)?.name_tc || '',
    stops: kmbInStops
  }, '#E1251B');

  const ctbLineStops = ((ctb1.json.data || [])).map((stop) => ({ lat: stop.lat, lng: stop.long ?? stop.lng })).filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  await checkLine('CTB 1', {
    route: '1',
    co: 'CTB',
    bound: 'I',
    orig: (ctb1.json.data || [])[0]?.name_tc || '跑馬地',
    dest: (ctb1.json.data || []).at(-1)?.name_tc || '中環',
    stops: ctbLineStops
  }, '#F5C400');

  const nlbLineStops = ((nlbStops.json.data || [])).map((stop) => ({ lat: stop.lat, lng: stop.long ?? stop.lng })).filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  await checkLine('NLB 1', {
    route: '1',
    co: 'NLB',
    bound: 'O',
    orig: (nlbStops.json.data || [])[0]?.name_tc || '',
    dest: (nlbStops.json.data || []).at(-1)?.name_tc || '',
    stops: nlbLineStops
  }, '#2F6FED');

  const lwbLineStops = ((lwbStops.json.data || [])).map((stop) => ({ lat: stop.lat, lng: stop.long ?? stop.lng })).filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  await checkLine('LWB A31', {
    route: 'A31',
    co: 'LWB',
    bound: 'O',
    orig: (lwbStops.json.data || [])[0]?.name_tc || '',
    dest: (lwbStops.json.data || []).at(-1)?.name_tc || '',
    stops: lwbLineStops
  }, '#F37021');

  const gmbLineRow = (gmb11.json.data || [])[0];
  const gmbLineStopsRaw = gmbLineRow
    ? (await get(`/api/gmb/route-stop/${encodeURIComponent(gmbLineRow.gmb_route_id)}/${encodeURIComponent(gmbLineRow.gmb_route_seq || 1)}`)).json.data || []
    : [];
  const gmbLineStops = gmbLineStopsRaw.slice(0, 8).map((stop) => ({ lat: stop.lat, lng: stop.long ?? stop.lng })).filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  await checkLine('GMB 11', {
    route: '11',
    co: 'GMB',
    bound: String(gmbLineRow?.bound || 'O'),
    orig: gmbLineRow?.orig_tc || '',
    dest: gmbLineRow?.dest_tc || '',
    stops: gmbLineStops
  }, '#00A651');

  const playground = await fetch(`${BASE}/playground`);
  if (!playground.ok) fail(`playground ${playground.status}`);
  else {
    const html = await playground.text();
    if (!/路線地圖練習場|Route map playground/.test(html)) fail('playground missing heading');
    else console.log('ok playground', playground.status);
  }

  const homesNoId = await fetch(`${BASE}/api/homes`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const homesNoJson = await homesNoId.json().catch(() => ({}));
  if (homesNoId.status !== 400) fail(`homes missing device ${homesNoId.status} ${JSON.stringify(homesNoJson)}`);
  else console.log('ok homes require device id');

  const homes = await get('/api/homes');
  if (!homes.ok || !Array.isArray(homes.json.data)) fail(`homes GET ${homes.status} ${JSON.stringify(homes.json)}`);
  else console.log('ok homes list', homes.json.data.length);

  const home = await fetch(`${BASE}/`);
  if (!home.ok) fail(`home ${home.status}`);
  else console.log('ok home', home.status);

  const html = await fetch(`${BASE}/standalone.html`);
  if (!html.ok) fail(`standalone ${html.status}`);
  else console.log('ok standalone', html.status);

  const manual = await fetch(`${BASE}/user-manual.pdf`);
  if (!manual.ok) fail(`user-manual.pdf ${manual.status}`);
  else {
    const buf = Buffer.from(await manual.arrayBuffer());
    const sniff = buf.subarray(0, 5).toString();
    if (!sniff.startsWith('%PDF')) fail(`user-manual.pdf not a PDF (${sniff})`);
    else console.log('ok user-manual.pdf', buf.length, 'bytes');
  }
  const manualHtml = await fetch(`${BASE}/user-manual.html`);
  if (!manualHtml.ok) fail(`user-manual.html ${manualHtml.status}`);
  else {
    const text = await manualHtml.text();
    if (/localhost|127\.0\.0\.1|:3001/i.test(text)) fail('user-manual.html mentions localhost/3001');
    else console.log('ok user-manual.html', text.length, 'chars');
  }

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
