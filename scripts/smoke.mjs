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
  const status = await get('/api/status');
  if (!status.ok || !status.json.routes) fail(`/api/status ${status.status} ${JSON.stringify(status.json)}`);
  else console.log('ok status', status.json.routes, 'routes', status.json.stops, 'stops', status.json.citybusStops || 0, 'citybusStops');

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

  const eta = await get('/api/kmb/route-eta/1/1');
  if (!eta.ok) fail(`KMB route-eta ${eta.status}`);
  else console.log('ok KMB route 1 etas', (eta.json.data || []).length);

  const nearby = await get('/api/stops/nearby?lat=22.2975&lng=114.1722&radius=250');
  if (!nearby.ok) fail(`nearby ${nearby.status}`);
  else if (!(nearby.json.data || []).length) fail('nearby TST returned no stops');
  else console.log('ok nearby TST', nearby.json.data.length, 'stops', nearby.json.data[0]?.name_en || nearby.json.data[0]?.name_tc);

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

  const ctbStops = await get('/api/citybus/route-stop/962/outbound');
  if (!ctbStops.ok) fail(`citybus 962 HTTP ${ctbStops.status}`);
  else if (!(ctbStops.json.data || []).length) fail('citybus 962 returned no stops');
  else if (!(ctbStops.json.data[0].name_tc || ctbStops.json.data[0].name_en)) fail('citybus 962 stop has no name');
  else console.log('ok citybus 962', ctbStops.json.data.length, 'stops', ctbStops.json.data[0].name_tc || ctbStops.json.data[0].name_en);

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
