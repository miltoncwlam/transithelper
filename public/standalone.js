(() => {
  'use strict';

  const I18N = globalThis.I18N;
  const KMB = 'https://data.etabus.gov.hk/v1/transport/kmb';
  const CTB = 'https://rt.data.gov.hk/v2/transport/citybus';
  const GMB = 'https://data.etagmb.gov.hk';
  const NLB = 'https://rt.data.gov.hk/v2/transport/nlb';
  const MTR_API = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';
  const HOME_KEY = 'tb-homes';
  const MTR_PREF_KEY = 'tb-mtr';
  const ARRIVAL_PREF_KEY = 'tb-arrival';
  const API_BASE = '';

  const $ = (id) => document.getElementById(id);
  const S = { routes: [], stops: [], map: new Map(), cache: new Map(), last: null, tab: 'arrivals', lines: globalThis.TB_MTR_LINES || {}, lang: localStorage.getItem('tb-lang') || 'zh', openStops: {}, fetchedStops: {}, direct: false };
  let timer;
  let deb;
  let transferSeq = 0;
  let backend = null;

  const t = (key, ...args) => {
    const value = (I18N?.[S.lang] || I18N?.zh || {})[key];
    return typeof value === 'function' ? value(...args) : (value || key);
  };

  const loc = (pair) => {
    if (!pair) return '';
    if (typeof pair === 'string') return pair;
    return S.lang === 'zh' ? (pair.zh || pair.en) : (pair.en || pair.zh);
  };

  function deviceId() {
    let id = localStorage.getItem('tb-device');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('tb-device', id);
    }
    return id;
  }

  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const n = (x) => String(x || '').trim().toUpperCase();
  function parseRouteToken(s) {
    const raw = n(s);
    const m = /^([A-Z]*)(\d+)([A-Z]*)$/.exec(raw);
    if (m) return { raw, prefix: m[1], num: m[2], suffix: m[3] };
    return { raw, prefix: raw.replace(/[^A-Z]/g, ''), num: raw.replace(/\D/g, ''), suffix: '' };
  }
  function routeMatchRank(query, route) {
    const q = parseRouteToken(query);
    const r = parseRouteToken(route);
    if (!q.raw || !r.raw) return 99;
    if (r.raw === q.raw) return 0;
    if (q.num && r.num && q.num === r.num) return 1;
    if (!q.num && q.raw && (r.prefix === q.raw || r.suffix === q.raw)) return 1;
    if (q.num && r.num && r.num.startsWith(q.num) && r.raw.startsWith(q.raw)) return 2;
    if (q.num && r.raw.startsWith(q.num)) return 2;
    if (q.num && (r.num.includes(q.num) || r.raw.includes(q.num))) return 3;
    if (q.raw.length >= 1 && r.raw.includes(q.raw)) return 4;
    return 99;
  }
  function stopNameKey(x) {
    return (x?.name_tc || x?.name_en || '').normalize('NFKC').replace(/\s*\([^)]*\)\s*/g, '').replace(/[\s–—_.,'"-]+/g, '').toLowerCase();
  }
  function serviceCo(row) {
    if (row?.co) return String(row.co).toUpperCase();
    if (row?.gmb_route_id) return 'GMB';
    if (row?.nlb_route_id) return 'NLB';
    return 'KMB';
  }
  function servicePlaceKey(x, side) {
    const tc = side === 'orig' ? (x.orig_tc || x.orig_en) : (x.dest_tc || x.dest_en);
    const en = side === 'orig' ? (x.orig_en || x.orig_tc) : (x.dest_en || x.dest_tc);
    return stopNameKey({ name_tc: tc, name_en: en });
  }
  function isShortWorking(shortSeq, fullSeq) {
    if (!shortSeq?.length || !fullSeq?.length) return false;
    if (shortSeq.length >= fullSeq.length * 0.92) return false;
    const fullKeys = new Set(fullSeq.map(stopNameKey));
    const hits = shortSeq.filter((s) => fullKeys.has(stopNameKey(s))).length;
    return hits >= Math.max(3, Math.ceil(shortSeq.length * 0.85));
  }
  const areaName = (x) => S.lang === 'zh' ? (x.name_tc || x.name_en || '') : (x.name_en || x.name_tc || '');
  const areaKey = (x) => (x.name_tc || x.name_en || '').normalize('NFKC').replace(/\s*\([^)]*\)\s*/g, '').replace(/[\s–—_.,'"-]+/g, '');
  const rn = (x) => S.lang === 'zh'
    ? `${x.orig_tc || x.orig_en} → ${x.dest_tc || x.dest_en}`
    : `${x.orig_en || x.orig_tc} → ${x.dest_en || x.dest_tc}`;
  const mins = (x) => {
    const date = new Date(x);
    if (Number.isNaN(date.getTime())) return null;
    return Math.max(0, Math.ceil((date - Date.now()) / 60000));
  };
  const clk = (x) => {
    const date = new Date(x);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(S.lang === 'zh' ? 'zh-HK' : 'en-HK', { hour: 'numeric', minute: '2-digit' });
  };
  const fareNote = (x, opts = {}) => {
    if (!x) return '';
    const parts = [];
    if (x.section_fare_hkd != null) parts.push(t('sectionFare', x.section_fare_hkd));
    else if (x.full_fare_hkd != null) parts.push(t('fullFare', x.full_fare_hkd));
    if (x.section_fare_hkd != null && x.full_fare_hkd != null && Number(x.section_fare_hkd) !== Number(x.full_fare_hkd)) {
      parts.push(t('fullFare', x.full_fare_hkd));
    }
    if (x.rideMinutes > 0) parts.push(t('rideMins', x.rideMinutes));
    else if (x.totalMinutes > 0) parts.push(typeof t('totalMins') === 'function' ? t('totalMins', x.totalMinutes) : `全程約 ${x.totalMinutes} 分鐘`);
    else if (x.journey_time_minutes != null && !opts.hideScheduled) parts.push(t('scheduledMins', x.journey_time_minutes));
    if (!parts.length) return '';
    return `<div class="muted">${esc(parts.join(' · '))}</div>`;
  };
  const put = (id, html) => { $(id).innerHTML = html; };

  async function hasBackend() {
    if (backend != null) return backend;
    if (new URLSearchParams(location.search).get('direct') === '1' || location.protocol === 'file:') {
      backend = false;
      return false;
    }
    if (/onecompiler|jsfiddle|codepen|codesandbox|stackblitz/i.test(location.hostname)) {
      backend = false;
      return false;
    }
    try {
      const res = await fetch(`${API_BASE}/api/status`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      backend = res.ok;
    } catch {
      backend = false;
    }
    return backend;
  }

  async function gov(url) {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data ?? json;
  }

  function parseGmbEtas(data, service) {
    const blocks = Array.isArray(data) ? data : (data ? [data] : []);
    const out = [];
    for (const block of blocks) {
      if (block.enabled === false) continue;
      const etas = Array.isArray(block.eta) ? block.eta : (block.timestamp ? [block] : []);
      for (const eta of etas) {
        const ts = eta.timestamp || eta.eta || eta.time;
        if (!ts) continue;
        const routeSeq = block.route_seq ?? service?.gmb_route_seq ?? 1;
        out.push({
          eta: ts,
          eta_seq: Number(eta.eta_seq) || out.length + 1,
          dest_tc: block.dest_tc || eta.dest_tc || service?.dest_tc || '',
          dest_en: block.dest_en || eta.dest_en || service?.dest_en || '',
          route: block.route_code || block.route || service?.route,
          dir: Number(routeSeq) === 1 ? 'O' : 'I',
          co: 'GMB'
        });
      }
    }
    return out;
  }

  async function gmbEtaDirect(stopId, s, stopSeq) {
    let path;
    if (s?.gmb_route_id && stopSeq) {
      path = `/eta/route-stop/${encodeURIComponent(s.gmb_route_id)}/${encodeURIComponent(s.gmb_route_seq || 1)}/${encodeURIComponent(stopSeq)}`;
    } else if (s?.gmb_route_id && stopId) {
      path = `/eta/route-stop/${encodeURIComponent(s.gmb_route_id)}/${encodeURIComponent(stopId)}`;
    } else if (stopId) {
      path = `/eta/stop/${encodeURIComponent(stopId)}`;
    } else {
      return [];
    }
    try {
      return parseGmbEtas(await gov(GMB + path), s);
    } catch {
      return [];
    }
  }

  async function hydrateGmbStops(rows) {
    await mapPool(rows, 8, async (row) => {
      if (Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.long))) return row;
      const key = `gmb-stop:${row.stop}`;
      if (S.cache.has(key)) {
        const coords = S.cache.get(key);
        if (coords) {
          row.lat = coords.lat;
          row.long = coords.long;
        }
        return row;
      }
      try {
        const data = await gov(`${GMB}/stop/${encodeURIComponent(row.stop)}`);
        const wgs = data?.coordinates?.wgs84;
        const coords = wgs && Number.isFinite(Number(wgs.latitude)) ? { lat: wgs.latitude, long: wgs.longitude } : null;
        S.cache.set(key, coords);
        if (coords) {
          row.lat = coords.lat;
          row.long = coords.long;
        }
      } catch {
        S.cache.set(key, null);
      }
      return row;
    });
    return rows;
  }

  async function gmbLookupDirect(code) {
    const regions = ['HKI', 'KLN', 'NT'];
    const out = [];
    await Promise.all(regions.map(async (region) => {
      try {
        const data = await gov(`${GMB}/route/${region}/${encodeURIComponent(code)}`);
        const items = Array.isArray(data) ? data : (data ? [data] : []);
        for (const item of items) {
          const directions = Array.isArray(item?.directions) ? item.directions : [];
          if (!directions.length) {
            out.push({
              co: 'GMB',
              route: item.route_code || code,
              bound: 'O',
              service_type: '1',
              gmb_route_id: item.route_id,
              gmb_route_seq: 1,
              gmb_region: region,
              orig_en: item.description_en || region,
              dest_en: item.description_en || region,
              orig_tc: item.description_tc || region,
              dest_tc: item.description_tc || region
            });
            continue;
          }
          directions.forEach((dir, idx) => {
            out.push({
              co: 'GMB',
              route: item.route_code || code,
              bound: idx === 0 || String(dir.route_seq) === '1' ? 'O' : 'I',
              service_type: '1',
              gmb_route_id: item.route_id,
              gmb_route_seq: dir.route_seq ?? idx + 1,
              gmb_region: region,
              orig_en: dir.orig_en || dir.orig_tc || '',
              dest_en: dir.dest_en || dir.dest_tc || '',
              orig_tc: dir.orig_tc || dir.orig_en || '',
              dest_tc: dir.dest_tc || dir.dest_en || ''
            });
          });
        }
      } catch {}
    }));
    return out;
  }

  function localHomes() {
    try {
      return JSON.parse(localStorage.getItem(HOME_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveLocalHomes(rows) {
    localStorage.setItem(HOME_KEY, JSON.stringify(rows));
  }

  function namedDest(s) {
    return { zh: s.dest_tc || s.dest_en || '', en: s.dest_en || s.dest_tc || '' };
  }

  function namedStop(row) {
    return { zh: row?.name_tc || row?.name_en || '', en: row?.name_en || row?.name_tc || '' };
  }

  async function mapPool(items, limit, fn) {
    const out = new Array(items.length);
    let i = 0;
    async function worker() {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, () => worker()));
    return out;
  }

  function metresBetween(a, b) {
    const metres = Math.hypot(
      (Number(a?.lat) - Number(b?.lat)) * 111000,
      (Number(a?.long) - Number(b?.long)) * 102000
    );
    return Number.isFinite(metres) ? metres : Infinity;
  }

  function usableHopMetres(metres) {
    if (!Number.isFinite(metres) || metres <= 0) return 450;
    if (metres > 80000) return 450;
    return metres;
  }

  function hopTravelMs(metres) {
    const dist = usableHopMetres(metres);
    if (dist >= 2000) return (dist / 12.5) * 1000;
    if (dist >= 800) return (dist / 8.3) * 1000 + 8000;
    return (dist / 4.8) * 1000 + 18000;
  }

  function maxPlausibleHopMs(metres, expectedMs) {
    const expected = expectedMs || hopTravelMs(metres);
    if (metres >= 2000) return Math.max(expected * 2.5, 15 * 60 * 1000);
    return Math.max(expected * 3, 8 * 60 * 1000);
  }

  function fasterThanHighwayMs(metres) {
    return (usableHopMetres(metres) / (70 / 3.6)) * 1000;
  }

  function walkMs(fromStop, toStop) {
    if (!fromStop || !toStop) return 90 * 1000;
    const meters = metresBetween(fromStop, toStop);
    if (!Number.isFinite(meters) || meters === Infinity) return 90 * 1000;
    return Math.round(Math.max(45 * 1000, (meters / 1.3) * 1000 + 30000));
  }

  function sameBound(etaDir, bound) {
    const a = String(etaDir || '').toUpperCase();
    const b = String(bound || '').toUpperCase();
    if (a === b) return true;
    if ((a === 'O' || a === 'OUTBOUND') && (b === 'O' || b === 'OUTBOUND')) return true;
    if ((a === 'I' || a === 'INBOUND') && (b === 'I' || b === 'INBOUND')) return true;
    return false;
  }

  function slotsFromEtas(etas) {
    return [...etas]
      .filter((item) => item?.eta)
      .sort((a, b) => (Number(a.eta_seq) || 0) - (Number(b.eta_seq) || 0) || new Date(a.eta) - new Date(b.eta))
      .map((item, i) => ({
        eta: item.eta,
        eta_seq: Number(item.eta_seq) || i + 1
      }))
      .slice(0, 3);
  }

  function etaSlotsAt(row, tables) {
    if (!row) return [];
    const raw = tables?.byStop?.size
      ? tables.byStop.get(row.stop)
      : tables?.bySeq?.size
        ? tables.bySeq.get(Number(row.seq))
        : null;
    return (raw || [])
      .map((item, i) => {
        const eta = item?.eta || item;
        const ms = new Date(eta).getTime();
        const slot = Number(item?.eta_seq) || i + 1;
        return { eta, ms, slot };
      })
      .filter((slot) => Number.isFinite(slot.ms))
      .sort((a, b) => a.slot - b.slot);
  }

  function pairAcrossHop(prevSlots, nextSlots, minHopMs) {
    const used = new Set();
    const pairs = [];
    for (const prev of [...(prevSlots || [])].sort((a, b) => a.ms - b.ms)) {
      const hit = (nextSlots || [])
        .filter((slot) => slot.ms >= prev.ms + minHopMs && slot.slot >= prev.slot && !used.has(slot.ms))
        .sort((a, b) => a.ms - b.ms)[0];
      if (hit) {
        used.add(hit.ms);
        pairs.push({ prev, next: hit });
      }
    }
    return pairs;
  }

  function observedHopMs(prevSlots, nextSlots, minHopMs = 60 * 1000) {
    const hops = pairAcrossHop(prevSlots, nextSlots, minHopMs).map((pair) => pair.next.ms - pair.prev.ms);
    if (!hops.length) return null;
    hops.sort((a, b) => a - b);
    return hops[Math.floor(hops.length / 2)];
  }

  function followStop(row, ms, estimated) {
    return {
      stop: row?.stop || null,
      name: namedStop(row),
      time: new Date(ms).toISOString(),
      estimated: !!estimated
    };
  }

  async function tdasHopMs(fromStop, toStop, departAtMs) {
    const lat1 = Number(fromStop?.lat);
    const lng1 = Number(fromStop?.long);
    const lat2 = Number(toStop?.lat);
    const lng2 = Number(toStop?.long);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
    const key = `tdas:${fromStop.stop || lat1}:${toStop.stop || lat2}`;
    if (S.cache.has(key)) return S.cache.get(key);
    const departIn = Math.max(0, Math.round((new Date(departAtMs).getTime() - Date.now()) / 60000 / 15) * 15);
    try {
      const res = await fetch('https://tdas-api.hkemobility.gov.hk/tdas/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          start: { lat: lat1, long: lng1 },
          end: { lat: lat2, long: lng2 },
          departIn
        }),
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) return null;
      const json = await res.json();
      const distM = Number(json?.distM);
      const speedMatch = /(\d+)/.exec(String(json?.jSpeed || ''));
      const carKmh = speedMatch ? Number(speedMatch[1]) : null;
      let ms = null;
      if (distM > 0) {
        const vc = Number.isFinite(carKmh) && carKmh > 0 ? carKmh : 45;
        const busKmh = vc <= 40 ? Math.max(8, 0.9 * vc) : Math.min(63, 36 + 0.77 * (vc - 40));
        ms = Math.round((distM / (busKmh / 3.6)) * 1000);
      }
      if (!ms || ms < 60 * 1000) return null;
      S.cache.set(key, ms);
      return ms;
    } catch {
      return null;
    }
  }

  async function followBusAlongRoute(seq, fromIdx, toIdx, tables, startIso) {
    const startMs = new Date(startIso).getTime();
    if (!Number.isFinite(startMs) || fromIdx < 0 || toIdx < fromIdx) {
      return { time: null, estimated: true, stops: [], leftBoard: false, boardLive: null };
    }
    const boardSlots = etaSlotsAt(seq[fromIdx], tables);
    const boardHit = boardSlots.reduce((best, slot) => {
      if (!best) return slot;
      return Math.abs(slot.ms - startMs) < Math.abs(best.ms - startMs) ? slot : best;
    }, null);
    const matched = boardHit && Math.abs(boardHit.ms - startMs) <= 10 * 60 * 1000 ? boardHit : null;
    let prevMs;
    let lastSlot;
    let estimated = false;
    let leftBoard = false;
    const stops = [];
    let startI = fromIdx + 1;
    if (matched) {
      prevMs = matched.ms;
      lastSlot = matched.slot;
      stops.push(followStop(seq[fromIdx], prevMs, false));
    } else {
      leftBoard = startMs <= Date.now() + 45 * 1000;
      estimated = true;
      prevMs = startMs;
      lastSlot = 1;
      stops.push(followStop(seq[fromIdx], startMs, true));
    }
    if (toIdx === fromIdx) {
      return { time: new Date(prevMs).toISOString(), estimated, stops, leftBoard, boardLive: matched?.eta || null };
    }
    for (let i = startI; i <= toIdx; i += 1) {
      const prevSlots = etaSlotsAt(seq[i - 1], tables);
      const slots = etaSlotsAt(seq[i], tables);
      const metres = usableHopMetres(metresBetween(seq[i - 1], seq[i]));
      const longHop = metres >= 2000;
      let expectedMs = hopTravelMs(metres);
      if (longHop) {
        const tdas = await tdasHopMs(seq[i - 1], seq[i], prevMs);
        if (tdas) expectedMs = tdas;
      }
      const minHop = longHop ? fasterThanHighwayMs(metres) : 0;
      const cap = maxPlausibleHopMs(metres, expectedMs);
      let hopEstimated = false;
      if (longHop) {
        const pairs = pairAcrossHop(prevSlots, slots, minHop);
        const mine = pairs.find((pair) => (
          Math.abs(pair.prev.ms - prevMs) <= 90 * 1000
          && pair.next.ms - prevMs <= cap
        ));
        if (mine) {
          prevMs = mine.next.ms;
          lastSlot = Math.max(lastSlot, mine.next.slot);
        } else {
          hopEstimated = true;
          estimated = true;
          prevMs += Math.max(expectedMs, 60 * 1000);
        }
      } else {
        const live = slots
          .filter((slot) => slot.ms >= prevMs + minHop && slot.slot >= lastSlot && slot.ms - prevMs <= cap)
          .sort((a, b) => a.ms - b.ms)[0];
        if (live) {
          prevMs = live.ms;
          lastSlot = live.slot;
        } else {
          hopEstimated = true;
          estimated = true;
          const observed = observedHopMs(prevSlots, slots);
          prevMs += Math.max((observed && observed <= cap ? observed : expectedMs), 60 * 1000);
        }
      }
      stops.push(followStop(seq[i], prevMs, hopEstimated));
    }
    return { time: new Date(prevMs).toISOString(), estimated, stops, leftBoard, boardLive: matched?.eta || null };
  }

  async function firstRouteEtaTables(first, seq, fromIdx, toIdx) {
    const empty = { bySeq: new Map(), byStop: new Map() };
    if (!first?.route || fromIdx < 0 || toIdx < fromIdx || !seq.length) return empty;
    const firstCo = serviceCo(first);
    if (firstCo === 'GMB' || firstCo === 'CTB' || firstCo === 'NLB') {
      const slice = seq.slice(fromIdx, toIdx + 1);
      const lists = await mapPool(slice, 6, (row) => eta(row.stop, first, row.seq));
      const byStop = new Map();
      slice.forEach((row, i) => {
        const matched = (lists[i] || []).filter((item) => {
          if (!item.eta) return false;
          if (firstCo === 'GMB') {
            return !item.route || n(item.route) === n(first.route);
          }
          return sameBound(item.dir, first.bound);
        });
        byStop.set(row.stop, slotsFromEtas(matched));
      });
      return { bySeq: new Map(), byStop };
    }
    try {
      const rows = await gov(`${KMB}/route-eta/${encodeURIComponent(first.route)}/${first.service_type || '1'}`);
      const grouped = new Map();
      for (const item of rows || []) {
        if (!item.eta) continue;
        if (n(item.route) !== n(first.route)) continue;
        if (String(item.service_type || '1') !== String(first.service_type || '1')) continue;
        if (!sameBound(item.dir, first.bound)) continue;
        const seqNo = Number(item.seq);
        if (!grouped.has(seqNo)) grouped.set(seqNo, []);
        grouped.get(seqNo).push(item);
      }
      const bySeq = new Map();
      for (const [seqNo, list] of grouped) bySeq.set(seqNo, slotsFromEtas(list));
      return { bySeq, byStop: new Map() };
    } catch {
      return empty;
    }
  }

  function stopPlaceKey(stop) {
    const name = stop?.name_tc || stop?.name_en || stop?.zh || stop?.en || '';
    return String(name).normalize('NFKC').replace(/\s*\([^)]*\)\s*/g, '').replace(/[\s–—_.,'"-]+/g, '').toLowerCase();
  }

  function expandNearby(seeds, radius) {
    const found = new Map();
    const all = new Map((S.stops || []).map((stop) => [stop.stop, stop]));
    for (const stop of S.map.values()) all.set(stop.stop, stop);
    for (const seed of seeds || []) {
      if (!seed?.stop) continue;
      found.set(seed.stop, seed);
      const lat = Number(seed.lat);
      const lng = Number(seed.long);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !radius) continue;
      for (const stop of all.values()) {
        const metres = Math.hypot((Number(stop.lat) - lat) * 111000, (Number(stop.long) - lng) * 102000);
        if (Number.isFinite(metres) && metres <= radius) found.set(stop.stop, stop);
      }
    }
    return [...found.values()];
  }

  function resolveStops(ids) {
    return (ids || []).map((id) => S.map.get(id)).filter(Boolean);
  }

  function matchesDest(row, destStops, destIds) {
    if (destIds.has(row.stop)) return true;
    return destStops.some((dest) => {
      if (dest.stop === row.stop) return true;
      const metres = metresBetween(row, dest);
      if (metres <= 80) return true;
      return metres <= 120 && stopPlaceKey(row) === stopPlaceKey(dest);
    });
  }

  function servesAfter(seq, fromId, destStops, destIds) {
    const fromIdx = seq.findIndex((row) => row.stop === fromId);
    if (fromIdx < 0) return null;
    const toIdx = seq.findIndex((row, i) => i > fromIdx && matchesDest(row, destStops, destIds));
    if (toIdx < 0) return null;
    return { from: seq[fromIdx], to: seq[toIdx] };
  }

  function isAlightPole(item, firstAlightIds) {
    const name = `${item.from?.zh || ''} ${item.from?.en || ''}`;
    if (/落客|alighting/i.test(name)) return true;
    return firstAlightIds.has(item.fromStop);
  }

  function preferBoardPole(next, prev, firstAlightIds) {
    const nextAlight = isAlightPole(next, firstAlightIds);
    const prevAlight = isAlightPole(prev, firstAlightIds);
    if (nextAlight !== prevAlight) return prevAlight;
    const nextSeq = Number(next.fromSeq);
    const prevSeq = Number(prev.fromSeq);
    if (Number.isFinite(nextSeq) && Number.isFinite(prevSeq) && nextSeq !== prevSeq) return nextSeq > prevSeq;
    return false;
  }

  function sameBbiTrip(row, item) {
    const pole = Math.hypot(
      (Number(row.fromLat) - Number(item.fromLat)) * 111000,
      (Number(row.fromLng) - Number(item.fromLng)) * 102000
    );
    return row.kind === item.kind
      && (row.co || 'KMB') === (item.co || 'KMB')
      && n(row.route) === n(item.route)
      && stopPlaceKey(row.from) === stopPlaceKey(item.from)
      && stopPlaceKey(row.to) === stopPlaceKey(item.to)
      && stopPlaceKey(row.dest) === stopPlaceKey(item.dest)
      && Math.abs(new Date(row.eta) - new Date(item.eta)) < 180000
      && (Number.isFinite(pole) ? pole : 0) <= 80;
  }

  function addUnique(list, item, firstAlightIds) {
    const idx = list.findIndex((row) => sameBbiTrip(row, item));
    if (idx < 0) {
      list.push(item);
      return;
    }
    if (preferBoardPole(item, list[idx], firstAlightIds || new Set())) list[idx] = item;
  }

  function connectionWatchKey(item) {
    return [
      item?.co || 'KMB',
      String(item?.route || '').toUpperCase(),
      item?.kind || 'transfer',
      stopPlaceKey(item?.dest),
      stopPlaceKey(item?.from)
    ].join('|');
  }

  function watchConnection(all, selected, firstArrival) {
    if (!selected?.route) return null;
    const key = connectionWatchKey(selected);
    const selectedMs = new Date(selected.eta).getTime();
    const liveMatches = (all || []).filter((row) => connectionWatchKey(row) === key);
    const closest = liveMatches.reduce((best, row) => {
      if (!best) return row;
      return Math.abs(new Date(row.eta) - selectedMs) < Math.abs(new Date(best.eta) - selectedMs) ? row : best;
    }, null);
    const live = closest && Number.isFinite(selectedMs) && Math.abs(new Date(closest.eta) - selectedMs) <= 10 * 60 * 1000
      ? closest
      : null;
    const arriveMs = firstArrival ? new Date(firstArrival).getTime() : null;
    const liveMs = live ? new Date(live.eta).getTime() : NaN;
    const catchable = Number.isFinite(liveMs) && (arriveMs == null || liveMs >= arriveMs);
    const compareMs = Number.isFinite(liveMs) ? liveMs : selectedMs;
    const earlier = (all || [])
      .filter((row) => {
        const etaMs = new Date(row.eta).getTime();
        if (!Number.isFinite(etaMs) || !Number.isFinite(compareMs)) return false;
        if (arriveMs != null && etaMs < arriveMs) return false;
        if (connectionWatchKey(row) === key && Math.abs(etaMs - compareMs) < 10 * 60 * 1000) return false;
        return etaMs < compareMs - 30000;
      })
      .sort((a, b) => new Date(a.eta) - new Date(b.eta))[0] || null;
    return { catchable, missed: !catchable, selected: live, earlier, left: !live && Number.isFinite(selectedMs) && selectedMs <= Date.now() };
  }

  function pickConnections(items) {
    const ranked = [...items].sort((a, b) => {
      const dt = new Date(a.eta) - new Date(b.eta);
      if (dt) return dt;
      if (a.kind === 'stay' && b.kind !== 'stay') return -1;
      if (b.kind === 'stay' && a.kind !== 'stay') return 1;
      return 0;
    });
    return ranked.slice(0, 3).map((item, i) => ({ ...item, recommended: i === 0 }));
  }

  function isFirstRoute(candidate, first) {
    return first
      && serviceCo(candidate) === serviceCo(first)
      && n(candidate.route) === n(first.route)
      && sameBound(candidate.bound, first.bound)
      && String(candidate.service_type || '1') === String(first.service_type || '1')
      && (serviceCo(first) !== 'GMB' || String(candidate.gmb_route_id || '') === String(first.gmb_route_id || ''));
  }

  function connectionRow(kind, candidate, entry, match, extra) {
    return {
      kind,
      co: serviceCo({ ...candidate, co: candidate.co || entry.eta?.co }),
      route: candidate.route,
      bound: candidate.bound,
      service_type: candidate.service_type,
      gmb_route_id: candidate.gmb_route_id,
      gmb_route_seq: candidate.gmb_route_seq,
      eta: entry.eta.eta,
      dest: namedDest(entry.eta),
      from: namedStop(match.from),
      to: namedStop(match.to),
      fromStop: match.from.stop,
      fromSeq: match.from.seq,
      fromLat: match.from.lat,
      fromLng: match.from.long,
      ...(extra || {})
    };
  }

  function groupCandidates(live) {
    const candidates = new Map();
    for (const row of live) {
      const co = row.eta.co || row.stop.co || 'KMB';
      const key = [co, n(row.eta.route), row.eta.dir, row.eta.service_type || '1'].join('|');
      if (!candidates.has(key)) {
        candidates.set(key, {
          co,
          route: row.eta.route,
          bound: row.eta.dir,
          service_type: row.eta.service_type || '1',
          dest_tc: row.eta.dest_tc,
          dest_en: row.eta.dest_en,
          entries: []
        });
      }
      candidates.get(key).entries.push(row);
    }
    return [...candidates.values()];
  }

  function hopExpectedMs(line, from, to) {
    const air = from === 'AIR' || to === 'AIR' || from === 'AWE' || to === 'AWE';
    if (line === 'AEL' && air) return 8 * 60 * 1000;
    if (line === 'AEL') return 3 * 60 * 1000;
    if (line === 'DRL') return 5 * 60 * 1000;
    if (line === 'EAL' || line === 'TCL') return 150 * 1000;
    if (line === 'TML') return 2 * 60 * 1000;
    return 2 * 60 * 1000;
  }

  function trainMs(train) {
    if (train?.time) {
      const ms = new Date(train.time).getTime();
      if (Number.isFinite(ms)) return ms;
    }
    if (train?.minutes != null) return Date.now() + train.minutes * 60000;
    return null;
  }

  function pickFollowedTrain(trains, board) {
    const dest = String(board?.destCode || '').trim().toUpperCase();
    const line = board?.line;
    const start = trainMs(board);
    const rows = (trains || []).filter((row) => !dest || String(row.destCode || '').trim().toUpperCase() === dest);
    const sameLine = line ? rows.filter((row) => row.line === line) : rows;
    const close = (list) => Number.isFinite(start)
      ? list.filter((row) => {
        const ms = trainMs(row);
        return Number.isFinite(ms) && Math.abs(ms - start) <= 90 * 1000;
      })
      : [];
    const withPath = (list) => list.find((row) => (row.stops || []).length > 1);
    return withPath(close(sameLine))
      || withPath(close(rows))
      || withPath(sameLine)
      || withPath(rows)
      || sameLine.find((row) => row.terminus)
      || rows.find((row) => row.terminus)
      || close(sameLine)[0]
      || sameLine[0]
      || rows[0]
      || null;
  }

  function slotsForDest(trains, destCode) {
    return (trains || [])
      .filter((train) => train.destCode === destCode)
      .map((train) => ({ ms: trainMs(train), time: train.time }))
      .filter((slot) => Number.isFinite(slot.ms))
      .sort((a, b) => a.ms - b.ms)
      .map((slot, i) => ({ ...slot, slot: i + 1 }));
  }

  function followTrainAlongPath(path, tables, destCode, startMs, line) {
    if (!path?.length || !Number.isFinite(startMs)) {
      return { time: null, estimated: true, stops: [] };
    }
    const boardSlots = slotsForDest(tables[path[0]] || [], destCode);
    const boardHit = boardSlots.find((slot) => Math.abs(slot.ms - startMs) <= 90 * 1000) || boardSlots[0];
    let prevMs = boardHit?.ms ?? startMs;
    let lastSlot = boardHit?.slot || 1;
    let estimated = false;
    const stops = [{
      stop: path[0],
      name: mtrStationName(path[0]),
      time: new Date(prevMs).toISOString(),
      estimated: false
    }];
    for (let i = 1; i < path.length; i += 1) {
      const prevSlots = slotsForDest(tables[path[i - 1]] || [], destCode);
      const slots = slotsForDest(tables[path[i]] || [], destCode);
      const expectedMs = hopExpectedMs(line, path[i - 1], path[i]);
      const longHop = expectedMs >= 5 * 60 * 1000;
      const minHop = longHop ? Math.max(90 * 1000, Math.round(expectedMs * 0.4)) : 60 * 1000;
      let hopEstimated = false;
      if (longHop) {
        const pairs = pairAcrossHop(prevSlots, slots, minHop);
        const mine = pairs.find((pair) => Math.abs(pair.prev.ms - prevMs) <= 90 * 1000);
        if (mine) {
          prevMs = mine.next.ms;
          lastSlot = Math.max(lastSlot, mine.next.slot);
        } else {
          hopEstimated = true;
          estimated = true;
          prevMs += expectedMs;
          lastSlot = Math.max(lastSlot, 3);
        }
      } else {
        const live = slots
          .filter((slot) => slot.ms >= prevMs + minHop && slot.slot >= lastSlot)
          .sort((a, b) => a.ms - b.ms)[0];
        if (live) {
          prevMs = live.ms;
          lastSlot = live.slot;
        } else {
          hopEstimated = true;
          estimated = true;
          const observed = observedHopMs(prevSlots, slots, minHop);
          prevMs += Math.max(observed || expectedMs, 60 * 1000);
          lastSlot = Math.max(lastSlot, 3);
        }
      }
      stops.push({
        stop: path[i],
        name: mtrStationName(path[i]),
        time: new Date(prevMs).toISOString(),
        estimated: hopEstimated
      });
    }
    return { time: new Date(prevMs).toISOString(), estimated, stops };
  }

  function mtrStationName(code) {
    const key = String(code || '').toUpperCase();
    for (const line of Object.values(globalThis.TB_MTR_LINES || {})) {
      const hit = (line.stations || []).find((row) => row[0] === key);
      if (hit) return { zh: hit[1], en: hit[2] };
    }
    return { zh: key || '車站', en: key || 'Station' };
  }

  function parseMtrTime(time) {
    if (!time || time === '-') return null;
    const raw = String(time).trim();
    const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const stamped = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}+08:00`;
    const date = new Date(stamped);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function normalizeMtr(payload, line, sta) {
    const delayed = payload?.isdelay === 'Y';
    const apiStatus = Number(payload?.status);
    const block = payload?.data?.[`${line}-${sta}`] || payload?.data?.[`${String(line).toUpperCase()}-${String(sta).toUpperCase()}`] || {};
    const trains = [];
    for (const dir of ['UP', 'DOWN']) {
      for (const train of block[dir] || []) {
        if (!train || train.valid === 'N') continue;
        const iso = parseMtrTime(train.time);
        const ttnt = Number(train.ttnt);
        const minutes = Number.isFinite(ttnt)
          ? Math.max(0, Math.round(ttnt))
          : (iso ? Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 60000)) : null);
        trains.push({
          dest: mtrStationName(train.dest),
          destCode: String(train.dest || '').trim().toUpperCase(),
          time: iso,
          minutes,
          platform: train.plat && train.plat !== '-' ? String(train.plat) : null,
          line
        });
      }
    }
    trains.sort((a, b) => (a.minutes ?? 99) - (b.minutes ?? 99));
    let emptyReason = null;
    if (apiStatus === 0) emptyReason = 'unavailable';
    else if (!trains.length) emptyReason = sta === 'RAC' ? 'racecourse' : 'empty';
    return { trains, delayed, emptyReason };
  }

  function mtrPath(line, origin, dest, trainDest) {
    const routes = (globalThis.TB_MTR_LINES?.[line]?.routes) || [(globalThis.TB_MTR_LINES?.[line]?.stations || []).map((row) => row[0])];
    const o = String(origin || '').toUpperCase();
    const d = String(dest || '').toUpperCase();
    const t = String(trainDest || '').toUpperCase();
    for (const path of routes) {
      const i = path.indexOf(o);
      const j = path.indexOf(d);
      const k = path.indexOf(t);
      if (i < 0 || j < 0 || k < 0 || i === j) continue;
      if (i < j && j <= k) return path.slice(i, j + 1);
      if (i > j && j >= k) return path.slice(j, i + 1).reverse();
    }
    return null;
  }

  function mtrLines() {
    return S.lines && Object.keys(S.lines).length ? S.lines : (globalThis.TB_MTR_LINES || {});
  }

  function hopsBetween(line, from, to) {
    const a = String(from || '').toUpperCase();
    const b = String(to || '').toUpperCase();
    if (!a || !b || a === b) return null;
    const data = mtrLines()[line];
    const routes = data?.routes || [(data?.stations || []).map((row) => row[0])];
    let best = Infinity;
    for (const path of routes) {
      const i = path.indexOf(a);
      const j = path.indexOf(b);
      if (i < 0 || j < 0) continue;
      best = Math.min(best, Math.abs(j - i));
    }
    return Number.isFinite(best) ? best : null;
  }

  function linesServing(origin, dest) {
    return Object.keys(mtrLines()).filter((line) => hopsBetween(line, origin, dest) != null);
  }

  async function fetchMtr(line, sta) {
    const res = await fetch(`${MTR_API}?line=${encodeURIComponent(line)}&sta=${encodeURIComponent(sta)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    return res.json();
  }

  async function mtrFollowLine(line, origin, dest, originBase) {
    const base = originBase || normalizeMtr(await fetchMtr(line, origin), line, origin);
    if (String(origin || '').trim().toUpperCase() && String(origin || '').trim().toUpperCase() === String(dest || '').trim().toUpperCase()) {
      const name = mtrLines()[line]?.name || { zh: line, en: line };
      const trains = (base.trains || [])
        .filter((train) => String(train.destCode || '').trim().toUpperCase() === String(origin || '').trim().toUpperCase())
        .map((train) => ({
          ...train,
          line,
          lineName: name,
          arrive: train.time,
          arriveMinutes: train.minutes,
          rideMinutes: 0,
          arrivalEstimated: false,
          terminus: true,
          stops: [{
            stop: String(origin).trim().toUpperCase(),
            name: mtrStationName(origin),
            time: train.time || null,
            estimated: false
          }]
        }));
      return {
        ...base,
        line,
        trains,
        emptyReason: trains.length ? null : (base.emptyReason === 'unavailable' ? 'unavailable' : 'no_dest')
      };
    }
    const serving = (base.trains || []).filter((train) => mtrPath(line, origin, dest, train.destCode));
    if (!serving.length) {
      return {
        ...base,
        line,
        trains: [],
        emptyReason: base.emptyReason === 'unavailable' ? 'unavailable' : (base.emptyReason || 'no_dest')
      };
    }
    const paths = serving.map((train) => mtrPath(line, origin, dest, train.destCode)).filter(Boolean);
    const codes = [...new Set(paths.flat())];
    const tables = {};
    await mapPool(codes, 6, async (code) => {
      if (code === origin && originBase) {
        tables[code] = originBase.trains;
        return;
      }
      try {
        const payload = await fetchMtr(line, code);
        const part = normalizeMtr(payload, line, code);
        if (part.delayed) base.delayed = true;
        tables[code] = part.trains;
      } catch {
        tables[code] = [];
      }
    });
    const name = mtrLines()[line]?.name || { zh: line, en: line };
    const trains = serving.map((train) => {
      const path = mtrPath(line, origin, dest, train.destCode);
      const boardMs = trainMs(train);
      const followed = followTrainAlongPath(path, tables, train.destCode, boardMs, line);
      if (!followed.time) return null;
      const arriveMs = new Date(followed.time).getTime();
      return {
        ...train,
        line,
        lineName: name,
        arrive: followed.time,
        arriveMinutes: Math.max(0, Math.ceil((arriveMs - Date.now()) / 60000)),
        rideMinutes: Number.isFinite(boardMs) ? Math.max(1, Math.round((arriveMs - boardMs) / 60000)) : null,
        arrivalEstimated: followed.estimated,
        stops: followed.stops || []
      };
    }).filter(Boolean);
    return { ...base, line, trains, emptyReason: trains.length ? null : (base.emptyReason || 'empty') };
  }

  async function api(path, options = {}) {
    const ctrl = new AbortController();
    const kill = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        cache: 'no-store',
        signal: ctrl.signal,
        headers: {
          Accept: 'application/json',
          'X-Device-Id': deviceId(),
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {})
        },
        ...options
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('none'));
      return json;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(t('timeout'));
      throw error;
    } finally {
      clearTimeout(kill);
    }
  }

  function applyStatic() {
    document.documentElement.lang = S.lang === 'zh' ? 'zh-Hant' : 'en';
    document.title = t('title');
    $('appTitle').textContent = t('title');
    $('appSubtitle').textContent = t('subtitle');
    $('langBtn').textContent = t('langBtn');
    if ($('guideBtn')) $('guideBtn').textContent = t('guideBtn') || (S.lang === 'zh' ? '使用說明' : 'Guide');
    const refresh = $('refresh');
    const keep = refresh.value;
    refresh.innerHTML = `<option value="15">${t('refresh15')}</option><option value="30">${t('refresh30')}</option>`;
    refresh.value = keep;
    document.querySelector('[data-tab="arrivals"]').textContent = t('tabArrivals');
    document.querySelector('[data-tab="transfer"]').textContent = t('tabTransfer');
    document.querySelector('[data-tab="mtr"]').textContent = t('tabMtr');
    document.querySelector('[data-tab="home"]').textContent = t('tabHome');
    $('arrivalsHeading').textContent = t('arrivalsHeading');
    $('arrivalRoute').placeholder = t('routePlaceholder');
    $('arrivalFind').textContent = t('find');
    $('transferHeading').textContent = t('transferHeading');
    $('nearbyLabel').textContent = t('nearbyLabel');
    $('radiusLabel').textContent = t('radiusLabel');
    const radius = $('radius');
    const radiusVal = radius.value;
    radius.innerHTML = `<option value="150">${t('m150')}</option><option value="250">${t('m250')}</option><option value="400">${t('m400')}</option>`;
    radius.value = radiusVal;
    $('firstRouteLabel').textContent = t('firstRouteLabel');
    $('firstRoute').placeholder = t('routePlaceholder');
    $('firstFind').textContent = t('find');
    $('destLabel').textContent = t('destLabel');
    $('destinationInput').placeholder = t('destPlaceholder');
    $('destinationFind').textContent = t('find');
    $('transferFind').textContent = t('transferFind');
    $('mtrHeading').textContent = t('mtrHeading');
    $('mtrLineLabel').textContent = t('mtrLineLabel');
    $('mtrStationLabel').textContent = t('mtrStationLabel');
    if ($('mtrDestLabel')) $('mtrDestLabel').textContent = t('mtrDestLabel');
    $('mtrFind').textContent = t('mtrFind');
    $('homeHeading').textContent = t('homeHeading');
    $('homeHelp').textContent = t('homeHelp');
    if ($('a2hs') && !window.matchMedia('(display-mode: standalone)').matches) {
      $('a2hs').textContent = t('addHomeScreen');
    }
    $('arrivalFind').setAttribute('aria-label', t('find'));
    $('firstFind').setAttribute('aria-label', t('find'));
    $('destinationFind').setAttribute('aria-label', t('find'));
    $('transferFind').setAttribute('aria-label', t('transferFind'));
    $('mtrFind').setAttribute('aria-label', t('mtrFind'));
  }

  async function refreshDynamic() {
    mtrInit();
    if (S.f && S.fg) {
      const board = $('board') && $('board').value;
      const inter = $('interchange') && $('interchange').value;
      await pickF(S.f, { board, inter, keepBoxHidden: $('firstBox').classList.contains('hidden') });
    }
    if (S.d) {
      put('destinationSummary', `<div class="note"><b>${esc(t('destArea'))}</b><div>${esc(S.d.label || areaName(S.d.stops[0] || {}))}</div><button id="changeD" class="tab mt-2">${esc(t('change'))}</button></div>`);
      $('changeD').onclick = () => {
        $('destinationBox').classList.remove('hidden');
        put('destinationSummary', '');
      };
    }
    if (S.last === 'a' && $('arrivalStop')) await showA();
    if (S.last === 't' && !S.chosenDirect) await startTransfer({ silent: true });
    if (S.last === 'm') await mtr();
    await renderHome();
  }

  async function load() {
    put('status', t('loading'));
    try {
      if (await hasBackend()) {
        S.lines = globalThis.TB_MTR_LINES || S.lines;
        mtrInit();
        const routes = await api('/api/kmb/routes');
        S.routes = routes.data || [];
        S.direct = false;
        mtrInit();
        put('status', S.routes.length ? t('ready', S.routes.length) : t('loadFail'));
        api('/api/kmb/stops').then((stops) => {
          S.stops = stops.data || [];
          S.map = new Map(S.stops.map((x) => [x.stop, x]));
        }).catch(() => {});
      } else {
        await loadDirect();
      }
    } catch {
      try {
        await loadDirect();
      } catch {
        put('status', t('loadFail'));
      }
    }
    await restoreArrivalPref();
    renderHome();
  }

  async function loadDirect() {
    const [kmbRoutes, kmbStops, ctbRoutes, nlbJson] = await Promise.all([
      gov(`${KMB}/route/`),
      gov(`${KMB}/stop`),
      gov(`${CTB}/route/CTB`).catch(() => []),
      fetch(`${NLB}/route.php?action=list`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ routes: [] }))
    ]);
    const kmb = (kmbRoutes || []).map((row) => ({ ...row, co: row.co || 'KMB' }));
    const ctb = [];
    for (const x of ctbRoutes || []) {
      ctb.push({
        co: 'CTB', route: x.route, bound: 'O', service_type: '1',
        orig_en: x.orig_en, dest_en: x.dest_en, orig_tc: x.orig_tc, dest_tc: x.dest_tc
      });
      ctb.push({
        co: 'CTB', route: x.route, bound: 'I', service_type: '1',
        orig_en: x.dest_en, dest_en: x.orig_en, orig_tc: x.dest_tc, dest_tc: x.orig_tc
      });
    }
    const nlb = (nlbJson.routes || []).map((row) => {
      const zh = String(row.routeName_c || '').split(/\s*>\s*/);
      const en = String(row.routeName_e || '').split(/\s*>\s*/);
      return {
        co: 'NLB',
        route: String(row.routeNo || ''),
        bound: 'O',
        service_type: '1',
        nlb_route_id: String(row.routeId),
        orig_tc: (zh[0] || '').trim(),
        dest_tc: (zh.slice(1).join(' > ') || zh[0] || '').trim(),
        orig_en: (en[0] || '').trim(),
        dest_en: (en.slice(1).join(' > ') || en[0] || '').trim()
      };
    });
    S.routes = [...kmb, ...ctb, ...nlb];
    S.stops = (kmbStops || []).map((row) => ({ ...row, co: row.co || 'KMB' }));
    S.map = new Map(S.stops.map((x) => [x.stop, x]));
    S.lines = globalThis.TB_MTR_LINES || {};
    S.direct = true;
    mtrInit();
    put('status', `${t('ready', S.routes.length)} · ${t('directMode')}`);
  }

  function matchArrivalService(pref) {
    const s = pref?.service;
    if (!s) return null;
    const co = serviceCo(s);
    const found = (S.routes || []).find((row) => {
      if (n(row.route) !== n(s.route)) return false;
      if (serviceCo(row) !== co) return false;
      if (co === 'GMB') {
        return String(row.gmb_route_id) === String(s.gmb_route_id)
          && String(row.gmb_route_seq || 1) === String(s.gmb_route_seq || 1);
      }
      if (co === 'NLB') return String(row.nlb_route_id || row.route) === String(s.nlb_route_id || s.route);
      return String(row.bound) === String(s.bound)
        && String(row.service_type || 1) === String(s.service_type || 1);
    });
    return found || s;
  }

  async function restoreArrivalPref() {
    if (S.arrivalRestored) return;
    S.arrivalRestored = true;
    let pref = {};
    try { pref = JSON.parse(localStorage.getItem(ARRIVAL_PREF_KEY) || '{}'); } catch {}
    if (!pref.service || pref.stopIndex === '' || pref.stopIndex == null) return;
    if ($('arrivalRoute')?.value) return;
    const s = matchArrivalService(pref);
    if (!s) return;
    S.restoringArrival = true;
    try {
      if ($('arrivalRoute')) $('arrivalRoute').value = s.route || pref.route || '';
      await pickA(s);
      if ($('arrivalStop')) $('arrivalStop').value = String(pref.stopIndex);
      fillArrivalDest();
      if (pref.destIndex !== '' && pref.destIndex != null && $('arrivalDest')) {
        $('arrivalDest').value = String(pref.destIndex);
      }
      await showA();
    } finally {
      S.restoringArrival = false;
    }
  }

  function groups(rows) {
    const m = new Map();
    rows.forEach((x) => {
      const k = areaKey(x);
      if (!m.has(k)) m.set(k, { stops: [] });
      m.get(k).stops.push(x);
    });
    return [...m.values()].map((g) => ({ ...g, label: areaName(g.stops[0]) }));
  }

  function matchBusServices(r) {
    const q = n(r);
    if (!q) return [];
    const byRoute = new Map();
    for (const x of S.routes) {
      const rank = routeMatchRank(q, x.route);
      if (rank >= 99) continue;
      const route = n(x.route);
      const cur = byRoute.get(route);
      if (!cur || rank < cur.rank) byRoute.set(route, { rank, route });
    }
    const names = [...byRoute.values()].sort((a, b) => a.rank - b.rank || a.route.length - b.route.length || a.route.localeCompare(b.route));
    const seen = new Set();
    const exact = [];
    const rest = [];
    for (const { route, rank } of names) {
      const bucket = rank === 0 ? exact : rest;
      for (const x of S.routes) {
        if (n(x.route) !== route) continue;
        if (serviceCo(x) === 'GMB' && !x.gmb_route_id) continue;
        const k = [x.co || 'KMB', x.bound, x.service_type, x.gmb_route_id || '', x.nlb_route_id || '', x.orig_en, x.dest_en].join('|');
        if (seen.has(k)) continue;
        seen.add(k);
        bucket.push(x);
      }
    }
    return exact.concat(rest.slice(0, 24));
  }

  async function stops(s) {
    const k = [serviceCo(s), s.route, s.bound, s.service_type, s.gmb_route_id || '', s.gmb_route_seq || '', s.nlb_route_id || ''].join('|');
    if (S.cache.has(k)) return S.cache.get(k);
    if (await hasBackend()) {
      if (serviceCo(s) === 'CTB') {
        const d = s.bound === 'I' ? 'inbound' : 'outbound';
        const json = await api(`/api/citybus/route-stop/${encodeURIComponent(s.route)}/${d}`);
        const rows = json.data || [];
        S.cache.set(k, rows);
        return rows;
      }
      if (serviceCo(s) === 'GMB' && s.gmb_route_id) {
        const json = await api(`/api/gmb/route-stop/${encodeURIComponent(s.gmb_route_id)}/${encodeURIComponent(s.gmb_route_seq || 1)}`);
        const rows = json.data || [];
        S.cache.set(k, rows);
        return rows;
      }
      if (serviceCo(s) === 'NLB' && s.nlb_route_id) {
        const json = await api(`/api/nlb/route-stop/${encodeURIComponent(s.nlb_route_id)}`);
        const rows = json.data || [];
        S.cache.set(k, rows);
        return rows;
      }
      const d = s.bound === 'O' ? 'outbound' : 'inbound';
      const json = await api(`/api/kmb/route-stop/${encodeURIComponent(s.route)}/${d}/${s.service_type}`);
      const rows = json.data || [];
      S.cache.set(k, rows);
      return rows;
    }
    let rows = [];
    if (serviceCo(s) === 'GMB' && s.gmb_route_id) {
      const data = await gov(`${GMB}/route-stop/${encodeURIComponent(s.gmb_route_id)}/${encodeURIComponent(s.gmb_route_seq || 1)}`);
      const list = data?.route_stops || data || [];
      rows = await hydrateGmbStops((Array.isArray(list) ? list : []).map((row, i) => ({
        stop: String(row.stop_id || row.stop || i),
        seq: row.stop_seq || row.seq || i + 1,
        name_en: row.name_en,
        name_tc: row.name_tc,
        lat: row.lat,
        long: row.long || row.lng,
        co: 'GMB'
      })));
    } else if (serviceCo(s) === 'NLB' && s.nlb_route_id) {
      const json = await fetch(`${NLB}/stop.php?action=list&routeId=${encodeURIComponent(s.nlb_route_id)}`, { cache: 'no-store' }).then((r) => r.json());
      rows = (json.stops || []).map((row, i) => ({
        stop: String(row.stopId),
        seq: i + 1,
        name_tc: row.stopName_c,
        name_en: row.stopName_e,
        lat: Number(row.latitude),
        long: Number(row.longitude),
        co: 'NLB'
      }));
    } else if (serviceCo(s) === 'CTB') {
      const d = s.bound === 'I' ? 'inbound' : 'outbound';
      const seq = [...(await gov(`${CTB}/route-stop/CTB/${encodeURIComponent(s.route)}/${d}`) || [])].sort((a, b) => a.seq - b.seq);
      rows = await Promise.all(seq.map(async (row) => {
        const known = S.map.get(row.stop);
        if (known?.name_tc) return { ...known, ...row, co: 'CTB' };
        try {
          const meta = await gov(`${CTB}/stop/${row.stop}`);
          const m = Array.isArray(meta) ? meta[0] : meta;
          const stop = {
            stop: row.stop,
            name_tc: m?.name_tc || row.stop,
            name_en: m?.name_en || row.stop,
            lat: m?.lat,
            long: m?.long,
            seq: row.seq,
            co: 'CTB'
          };
          S.map.set(row.stop, stop);
          S.stops.push(stop);
          return stop;
        } catch {
          return { stop: row.stop, name_tc: row.stop, name_en: row.stop, seq: row.seq, co: 'CTB' };
        }
      }));
    } else {
      const d = s.bound === 'O' ? 'outbound' : 'inbound';
      rows = (await gov(`${KMB}/route-stop/${encodeURIComponent(s.route)}/${d}/${s.service_type}`) || []).map((row) => ({
        ...(S.map.get(row.stop) || {}),
        ...row,
        co: 'KMB'
      }));
    }
    S.cache.set(k, rows);
    return rows;
  }

  async function eta(stop, s, stopSeq) {
    try {
      if (await hasBackend()) {
        if (serviceCo(s) === 'CTB') {
          const json = await api(`/api/citybus/eta/${encodeURIComponent(stop)}/${encodeURIComponent(s.route)}`);
          return (json.data || []).filter((x) => x.eta).map((x) => ({ ...x, dir: s.bound, service_type: '1', route: s.route }));
        }
        if (serviceCo(s) === 'GMB') {
          const qs = new URLSearchParams();
          if (s.gmb_route_id) qs.set('routeId', s.gmb_route_id);
          if (s.gmb_route_seq) qs.set('routeSeq', s.gmb_route_seq);
          if (stopSeq) qs.set('stopSeq', String(stopSeq));
          if (s.route) qs.set('route', s.route);
          const json = await api(`/api/gmb/eta/${encodeURIComponent(stop)}${qs.toString() ? `?${qs}` : ''}`);
          return (json.data || []).filter((x) => x.eta).map((x) => ({
            ...x,
            dir: x.dir || s.bound,
            service_type: '1',
            route: x.route || s.route,
            dest_tc: x.dest_tc || s.dest_tc,
            dest_en: x.dest_en || s.dest_en
          }));
        }
        if (serviceCo(s) === 'NLB' && s.nlb_route_id) {
          const json = await api(`/api/nlb/eta/${encodeURIComponent(s.nlb_route_id)}/${encodeURIComponent(stop)}`);
          return (json.data || []).filter((x) => x.eta);
        }
        const json = await api(`/api/kmb/stop-eta/${encodeURIComponent(stop)}`);
        return (json.data || []).filter((x) =>
          n(x.route) === n(s.route)
          && String(x.service_type) === String(s.service_type)
          && x.dir === s.bound
          && x.eta
        );
      }
      if (serviceCo(s) === 'GMB') return gmbEtaDirect(stop, s, stopSeq);
      if (serviceCo(s) === 'NLB' && s.nlb_route_id) {
        const json = await fetch(`${NLB}/stop.php?action=estimatedArrivals&routeId=${encodeURIComponent(s.nlb_route_id)}&stopId=${encodeURIComponent(stop)}&language=zh`, { cache: 'no-store' }).then((r) => r.json());
        return (json.estimatedArrivals || []).map((row, i) => {
          const raw = String(row.estimatedArrivalTime || '').replace(' ', 'T');
          const eta = raw ? `${raw}+08:00` : '';
          if (!eta) return null;
          return { eta, eta_seq: i + 1, dest_tc: s.dest_tc, dest_en: s.dest_en, route: s.route, dir: 'O', co: 'NLB', nlb_route_id: s.nlb_route_id };
        }).filter(Boolean);
      }
      if (serviceCo(s) === 'CTB') {
        const data = await gov(`${CTB}/eta/CTB/${encodeURIComponent(stop)}/${encodeURIComponent(s.route)}`);
        return (data || []).filter((x) => x.eta).map((x) => ({ ...x, dir: s.bound, service_type: '1', route: s.route, co: 'CTB' }));
      }
      const data = await gov(`${KMB}/stop-eta/${encodeURIComponent(stop)}`);
      return (data || []).filter((x) =>
        n(x.route) === n(s.route)
        && String(x.service_type) === String(s.service_type || '1')
        && x.dir === s.bound
        && x.eta
      );
    } catch {
      return [];
    }
  }

  async function routeLive(s, seq = []) {
    if (serviceCo(s) === 'GMB' || serviceCo(s) === 'NLB') {
      const probe = seq[0];
      if (!probe) return [];
      try { return await eta(probe.stop, s, probe.seq); } catch { return []; }
    }
    if (serviceCo(s) === 'CTB') {
      const probes = [];
      if (seq[0]) probes.push(seq[0]);
      if (seq.length > 4) probes.push(seq[Math.floor(seq.length / 3)]);
      for (const row of probes) {
        try {
          const rows = await eta(row.stop, s);
          if (rows.length) return rows;
        } catch {}
      }
      return [];
    }
    try {
      if (await hasBackend()) {
        const json = await api(`/api/kmb/route-eta/${encodeURIComponent(s.route)}/${s.service_type}`);
        return (json.data || []).filter((x) => x.eta && x.dir === s.bound);
      }
      const data = await gov(`${KMB}/route-eta/${encodeURIComponent(s.route)}/${s.service_type}`);
      return (data || []).filter((x) => x.eta && x.dir === s.bound);
    } catch {
      return [];
    }
  }

  function destName(x) {
    return S.lang === 'zh' ? (x.dest_tc || x.dest_en || '') : (x.dest_en || x.dest_tc || '');
  }

  function coBadge(service, companies) {
    const set = new Set((companies && companies.length ? companies : [serviceCo(service)]).map(String));
    const hasCtb = set.has('CTB');
    const hasGmb = set.has('GMB');
    const hasNlb = set.has('NLB');
    const hasFranchised = [...set].some((c) => c !== 'CTB' && c !== 'GMB' && c !== 'NLB');
    if (hasCtb && hasFranchised) return t('coJoint');
    if (hasGmb) {
      const region = service?.gmb_region === 'HKI' ? t('regionHki') : service?.gmb_region === 'KLN' ? t('regionKln') : service?.gmb_region === 'NT' ? t('regionNt') : '';
      return region ? `${t('coGmb')} · ${region}` : t('coGmb');
    }
    if (hasNlb) return t('coNlb');
    if (hasCtb) return t('coCtb');
    if (set.has('LWB')) return t('coLwb');
    return t('coKmb');
  }

  function mergeLiveChoices(keep) {
    const byJourney = new Map();
    for (const z of keep) {
      const k = serviceCo(z.x) === 'GMB'
        ? ['GMB', n(z.x.route), servicePlaceKey(z.x, 'orig'), servicePlaceKey(z.x, 'dest'), z.x.gmb_route_id || ''].join('|')
        : serviceCo(z.x) === 'NLB'
          ? ['NLB', n(z.x.route), z.x.nlb_route_id || ''].join('|')
          : ['BUS', n(z.x.route), z.x.bound, servicePlaceKey(z.x, 'orig'), servicePlaceKey(z.x, 'dest')].join('|');
      if (!byJourney.has(k)) byJourney.set(k, []);
      byJourney.get(k).push(z);
    }
    const journeys = [];
    for (const list of byJourney.values()) {
      const ranked = list.slice().sort((a, b) => {
        const aKmb = serviceCo(a.x) !== 'CTB' && serviceCo(a.x) !== 'GMB' && serviceCo(a.x) !== 'NLB' ? 1 : 0;
        const bKmb = serviceCo(b.x) !== 'CTB' && serviceCo(b.x) !== 'GMB' && serviceCo(b.x) !== 'NLB' ? 1 : 0;
        return (b.live.length - a.live.length) || (b.seq.length - a.seq.length) || (bKmb - aKmb);
      });
      const best = ranked[0];
      journeys.push({
        ...best,
        companies: [...new Set(list.map((z) => serviceCo(z.x)))],
        live: list.flatMap((z) => z.live)
      });
    }
    const byRouteBound = new Map();
    for (const z of journeys) {
      const k = [serviceCo(z.x) === 'GMB' ? 'GMB' : serviceCo(z.x) === 'NLB' ? 'NLB' : 'BUS', n(z.x.route), z.x.bound, z.x.gmb_route_id || z.x.nlb_route_id || ''].join('|');
      if (!byRouteBound.has(k)) byRouteBound.set(k, []);
      byRouteBound.get(k).push(z);
    }
    const out = [];
    for (const list of byRouteBound.values()) {
      const sorted = list.slice().sort((a, b) => b.seq.length - a.seq.length);
      const used = new Set();
      for (let i = 0; i < sorted.length; i += 1) {
        if (used.has(i)) continue;
        const full = sorted[i];
        const shortDests = [];
        for (let j = i + 1; j < sorted.length; j += 1) {
          if (used.has(j)) continue;
          if (isShortWorking(sorted[j].seq, full.seq)) {
            used.add(j);
            const name = destName(sorted[j].x);
            if (name) shortDests.push(name);
          }
        }
        out.push({ ...full, shortDests });
      }
    }
    return out;
  }

  async function choices(id, routeStr, pick) {
    let rows = matchBusServices(routeStr).filter((x) => serviceCo(x) !== 'GMB' || x.gmb_route_id);
    try {
      if (await hasBackend()) {
        const json = await api(`/api/gmb/lookup?route=${encodeURIComponent(n(routeStr))}`);
        rows = [...rows, ...(json.data || [])];
      } else {
        rows = [...rows, ...(await gmbLookupDirect(n(routeStr)))];
      }
    } catch {}
    if (!rows.length) {
      put(id, `<p class="muted">${esc(t('noRoute'))}</p>`);
      return;
    }
    put(id, `<div class="note">${esc(t('checking'))}</div>`);
    const info = await Promise.all(rows.map(async (x) => {
      let seq = [];
      let live = [];
      try { seq = await stops(x); } catch {}
      try { live = await routeLive(x, seq); } catch {}
      return { x, live, seq };
    }));
    const keep = info.filter((z) => z.live.length > 0 && z.seq.length);
    if (!keep.length) {
      put(id, `<p class="muted">${esc(t(info.some((z) => z.seq.length) ? 'noLiveNow' : 'routeUnavailable'))}</p>`);
      return;
    }
    const merged = mergeLiveChoices(keep).sort((a, b) => routeMatchRank(routeStr, a.x.route) - routeMatchRank(routeStr, b.x.route) || String(a.x.route).length - String(b.x.route).length);
    if (merged.length === 1) {
      put(id, '');
      await pick(merged[0].x);
      return;
    }
    put(id, merged.map((z, i) => {
      const note = (z.shortDests || []).length ? t('shortWorking', z.shortDests.join(S.lang === 'zh' ? '、' : ', ')) : '';
      return `<button class="item choice" data-i="${i}"><span class="badge">${esc(coBadge(z.x, z.companies))}</span> <b>${esc(z.x.route)}</b><div>${esc(rn(z.x))}</div>${fareNote(z.x)}${note ? `<div class="muted">${esc(note)}</div>` : ''}</button>`;
    }).join(''));
    $(id).querySelectorAll('button').forEach((b) => {
      b.onclick = () => pick(merged[+b.dataset.i].x);
    });
  }

  function cluster(a) {
    a = [...new Set(a)].sort((x, y) => new Date(x) - new Date(y));
    return a.filter((x, i) => !i || new Date(x) - new Date(a[i - 1]) > 90000);
  }

  function stopTimesBlock(id, stops, fetchable) {
    const cached = S.fetchedStops[id];
    const terminus = !!(stops?.terminus || cached?.terminus);
    const list = (Array.isArray(stops) && stops.length > 1)
      ? stops
      : (Array.isArray(cached) ? cached : []);
    const loading = cached === 'loading';
    if (!terminus && list.length < 2 && !loading && !fetchable) return '';
    const open = !!S.openStops[id];
    const btn = `<button class="tab mt-2" type="button" data-stops="${esc(id)}" data-fetch="${fetchable ? '1' : '0'}">${esc(open ? t('hideStopTimes') : t('showStopTimes'))}</button>`;
    if (!open) return btn;
    if (loading) return `${btn}<p class="muted mt-2">${esc(t('stopTimesLoading'))}</p>`;
    if (terminus) return `${btn}<p class="muted mt-2">${esc(t('stopTimesTerminus'))}</p>`;
    if (list.length < 2) return `${btn}<p class="muted mt-2">${esc(t('stopTimesEmpty'))}</p>`;
    const rows = list.map((stop) => `<li><span>${esc(loc(stop.name))}</span><span>${esc(clk(stop.time))}${stop.estimated ? ` · ${esc(t('stopTimeEst'))}` : ''}</span></li>`).join('');
    return `${btn}<ol class="stop-times">${rows}</ol>`;
  }

  function bindStopTimes(root, fetchers) {
    if (!root) return;
    root.querySelectorAll('[data-stops]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.stops;
        if (S.openStops[id]) {
          S.openStops[id] = false;
          if (fetchers?.paint) fetchers.paint();
          return;
        }
        S.openStops[id] = true;
        if (fetchers?.paint) fetchers.paint();
        const hasList = (Array.isArray(S.fetchedStops[id]) && S.fetchedStops[id].length > 1)
          || S.fetchedStops[id]?.terminus
          || (fetchers?.stops && ((fetchers.stops(id) || []).length > 1 || fetchers.stops(id)?.terminus));
        if (!hasList && btn.dataset.fetch === '1' && fetchers?.load) {
          await fetchers.load(id);
          if (fetchers.paint) fetchers.paint();
        }
      };
    });
  }

  function etaList(input, opts = {}) {
    const isRide = input && !Array.isArray(input);
    const trips = isRide ? (input.trips || []) : (input || []).map((time) => ({ board: time }));
    const destLabel = isRide ? input.destLabel : null;
    if (isRide && input.emptyReason === 'no_dest') return `<p class="muted">${esc(t('noRideDest'))}</p>`;
    if (!trips.length) return `<p class="muted">${esc(t(isRide ? 'noLiveNow' : 'noEta'))}</p>`;
    return trips.map((x, i) => {
      const board = x.board || x;
      const wait = destLabel && x.arrive ? mins(x.arrive) : mins(board);
      const service = x.route
        ? `<span class="badge">${esc(coBadge(x))}</span> <b>${esc(x.route)}</b>${loc(x.dest) ? `<div>${esc(t('towards'))}${S.lang === 'zh' ? '' : ' '}${esc(loc(x.dest))}</div>` : ''}`
        : `<b>${esc(clk(board))}</b>`;
      const extra = destLabel && x.arrive
        ? `<div class="muted">${esc(clk(x.arrive))} ${esc(t('rideArrives'))}${S.lang === 'zh' ? '' : ' '}${esc(destLabel)}${x.rideMinutes != null ? ` · ${esc(t('rideMins', x.rideMinutes))}` : ''}</div>`
        : '';
      const guess = destLabel && x.arrivalEstimated ? `<div class="muted">${esc(t('rideArriveGuessed'))}</div>` : '';
      const earliest = destLabel && i === 0 ? `<span class="badge">${esc(t('earliestArrival'))}</span>` : '';
      const depart = destLabel ? `<div class="muted">${esc(clk(board))} ${esc(t('rideDeparts'))}</div>` : '';
      const fetchable = !!(opts.fetchStops && !(x.stops && x.stops.length > 1));
      return `<div class="item"><div class="eta"><div>${earliest}${service}${depart}${extra}${guess}</div><span class="mins">${esc(t('minutes', wait))}</span></div>${stopTimesBlock(`arrival-${board}`, x.stops, fetchable)}</div>`;
    }).join('');
  }

  function fillArrivalDest() {
    const v = $('arrivalStop')?.value;
    const keep = $('arrivalDest')?.value;
    if (v === '' || v == null) {
      put('arrivalDest', '');
      return;
    }
    const opts = S.ag.map((g, i) => (i > +v ? `<option value="${i}">${esc(g.label)}</option>` : '')).join('');
    put('arrivalDest', `<label class="block mt-3"><span>${esc(t('rideDestLabel'))}</span><select id="arrivalDest" class="field mt-1"><option value="">${esc(t('chooseRideDest'))}</option>${opts}</select></label>`);
    if (keep && +keep > +v) $('arrivalDest').value = keep;
    $('arrivalDest').onchange = showA;
  }

  async function rideDirect(first, boardStops, destStopIds) {
    const seq = await stops(first);
    const boardIds = new Set(boardStops || []);
    const destStops = resolveStops(destStopIds);
    const destIds = new Set(destStops.map((row) => row.stop));
    const fromIdx = seq.findIndex((row) => boardIds.has(row.stop));
    if (fromIdx < 0) return { trips: [], emptyReason: 'empty' };
    const destIdx = destIds.size
      ? seq.findIndex((row, i) => i > fromIdx && matchesDest(row, destStops, destIds))
      : -1;
    if (destIds.size && destIdx < 0) return { trips: [], emptyReason: 'no_dest' };
    const toIdx = destIdx >= 0 ? destIdx : seq.length - 1;
    if (toIdx < fromIdx) return { trips: [], emptyReason: 'empty' };
    const boardEtas = cluster((await eta(seq[fromIdx].stop, first, seq[fromIdx].seq)).map((x) => x.eta));
    const dest = namedDest(first);
    if (toIdx === fromIdx) {
      return {
        trips: boardEtas.map((time) => ({ board: time, route: first.route, co: serviceCo(first), dest, gmb_route_id: first.gmb_route_id, gmb_route_seq: first.gmb_route_seq })),
        emptyReason: null
      };
    }
    const tables = await firstRouteEtaTables(first, seq, fromIdx, toIdx);
    const trips = [];
    for (const board of boardEtas) {
      const followed = await followBusAlongRoute(seq, fromIdx, toIdx, tables, board);
      if (!followed.time) continue;
      trips.push({
        board,
        arrive: followed.time,
        arrivalEstimated: followed.estimated,
        rideMinutes: Math.max(1, Math.round((new Date(followed.time) - new Date(board)) / 60000)),
        route: first.route,
        co: serviceCo(first),
        gmb_route_id: first.gmb_route_id,
        gmb_route_seq: first.gmb_route_seq,
        dest,
        stops: followed.stops || []
      });
    }
    return { trips, emptyReason: trips.length ? null : 'empty' };
  }

  async function pickA(s) {
    S.a = s;
    S.ag = groups(await stops(s));
    S.fetchedStops = {};
    S.openStops = {};
    put('arrivalVariants', '');
    put('arrivalStops', `<select id="arrivalStop" class="field mt-3"><option value="">${esc(t('chooseStop'))}</option>${S.ag.map((g, i) => `<option value="${i}">${esc(g.label)}</option>`).join('')}</select>`);
    $('arrivalStop').onchange = () => { fillArrivalDest(); showA(); };
    fillArrivalDest();
  }

  function paintArrival() {
    const v = $('arrivalStop')?.value;
    if (v === '' || !S.arrivalPayload) return;
    const g = S.ag[+v];
    const destVal = $('arrivalDest')?.value || '';
    const destGroup = destVal !== '' && +destVal > +v ? S.ag[+destVal] : null;
    const payload = S.arrivalPayload;
    put('arrivalOutput', `<h3 class="font-bold mt-3">${esc(g.label)}${payload.destLabel ? ` → ${esc(payload.destLabel)}` : ''}</h3>${fareNote(S.a, { hideScheduled: !!(payload.destLabel && (payload.trips || []).some((row) => row.rideMinutes > 0)) })}${etaList(payload, { fetchStops: true })}<div class="row-actions"><button id="saveArrival" class="tab">${esc(t('saveHome'))}</button></div>`);
    $('saveArrival').onclick = () => saveHome({
      type: 'arrival',
      title: { zh: `${S.a.route}（${areaName(g.stops[0])}）`, en: `${S.a.route} at ${g.stops[0].name_en || g.stops[0].name_tc}` },
      subtitle: destGroup
        ? { zh: `${g.label} → ${destGroup.label}`, en: `${g.label} → ${destGroup.label}` }
        : { zh: `${S.a.orig_tc || S.a.orig_en} → ${S.a.dest_tc || S.a.dest_en}`, en: `${S.a.orig_en || S.a.orig_tc} → ${S.a.dest_en || S.a.dest_tc}` },
      payload: { service: S.a, stopIndex: +v, destIndex: destVal === '' ? '' : +destVal }
    });
    bindStopTimes($('arrivalOutput'), {
      paint: paintArrival,
      stops: (id) => {
        const board = id.slice('arrival-'.length);
        return (payload.trips || []).find((row) => String(row.board) === board)?.stops;
      },
      load: async (id) => {
        if (S.fetchedStops[id] === 'loading' || (Array.isArray(S.fetchedStops[id]) && S.fetchedStops[id].length)) return;
        const board = id.slice('arrival-'.length);
        S.fetchedStops[id] = 'loading';
        paintArrival();
        try {
          const json = await hasBackend()
            ? await api('/api/ride', {
              method: 'POST',
              body: JSON.stringify({
                first: S.a,
                boardStops: stopIds(g),
                destStops: []
              })
            })
            : await rideDirect(S.a, stopIds(g), []);
          const hit = (json.trips || []).find((row) => Math.abs(new Date(row.board) - new Date(board)) <= 90 * 1000)
            || (json.trips || [])[0];
          S.fetchedStops[id] = hit?.stops || [];
        } catch {
          S.fetchedStops[id] = [];
        }
      }
    });
  }

  async function showA() {
    const v = $('arrivalStop').value;
    if (v === '') return;
    const g = S.ag[+v];
    const destVal = $('arrivalDest')?.value || '';
    const destGroup = destVal !== '' && +destVal > +v ? S.ag[+destVal] : null;
    S.fetchedStops = {};
    S.openStops = {};
    let payload;
    try {
      const json = await hasBackend()
        ? await api('/api/ride', {
          method: 'POST',
          body: JSON.stringify({
            first: S.a,
            boardStops: stopIds(g),
            destStops: destGroup ? stopIds(destGroup) : []
          })
        })
        : await rideDirect(S.a, stopIds(g), destGroup ? stopIds(destGroup) : []);
      payload = { trips: json.trips || [], destLabel: destGroup?.label || null, emptyReason: json.emptyReason };
    } catch {
      payload = { trips: [], destLabel: destGroup?.label || null, emptyReason: 'empty' };
    }
    S.arrivalPayload = payload;
    paintArrival();
    S.last = 'a';
    try {
      localStorage.setItem(ARRIVAL_PREF_KEY, JSON.stringify({
        route: S.a?.route || '',
        service: S.a,
        stopIndex: v,
        destIndex: destVal
      }));
    } catch {}
  }

  async function pickF(s, restore = {}) {
    S.f = s;
    S.fg = groups(await stops(s));
    if (restore.keepBoxHidden === false) $('firstBox').classList.remove('hidden');
    else $('firstBox').classList.add('hidden');
    put('firstVariants', '');
    put('firstSummary', `<div class="note"><b>${esc(s.route)}</b><div>${esc(rn(s))}</div>${fareNote(s)}<button id="changeF" class="tab mt-2">${esc(t('change'))}</button></div>`);
    $('changeF').onclick = () => {
      $('firstBox').classList.remove('hidden');
      put('firstSummary', '');
    };
    const paintInter = () => {
      const board = $('board')?.value;
      const interOpts = S.fg.map((g, i) => (board !== '' && i >= +board ? `<option value="${i}">${esc(g.label)}</option>` : '')).join('');
      const prev = $('interchange')?.value;
      $('interchange').innerHTML = `<option value="">${esc(t('chooseInterchange'))}</option>${interOpts}`;
      if (prev !== '' && board !== '' && +prev >= +board) $('interchange').value = prev;
      else $('interchange').value = '';
    };
    const o = S.fg.map((g, i) => `<option value="${i}">${esc(g.label)}</option>`).join('');
    put('firstStops', `<div class="md-grid-2 mt-4"><label>${esc(t('boardStop'))}<select id="board" class="field mt-1"><option value="">${esc(t('notSelected'))}</option>${o}</select></label><label>${esc(t('interchangeStop'))}<select id="interchange" class="field mt-1"><option value="">${esc(t('chooseInterchange'))}</option></select></label></div>`);
    if (restore.board != null) $('board').value = restore.board;
    paintInter();
    if (restore.inter != null && restore.board != null && +restore.inter >= +restore.board) $('interchange').value = restore.inter;
    $('board').onchange = paintInter;
  }

  function dest() {
    const q = $('destinationInput').value.trim().toLowerCase();
    const seen = new Set((S.stops || []).map((x) => x.stop));
    const extra = [...S.map.values()].filter((x) => x.stop && !seen.has(x.stop));
    const pool = [...(S.stops || []), ...extra];
    const g = groups(pool.filter((x) => q.length > 1 && (
      (x.name_en || '').toLowerCase().includes(q) || (x.name_tc || '').includes(q)
    ))).slice(0, 40);
    S.dg = g;
    put('destinationResults', g.map((x, i) => `<button class="item choice" data-i="${i}">${esc(x.label)}</button>`).join('') || `<p class="muted">${esc(t('noStops'))}</p>`);
    $('destinationResults').querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        S.d = S.dg[+b.dataset.i];
        $('destinationBox').classList.add('hidden');
        put('destinationSummary', `<div class="note"><b>${esc(t('destArea'))}</b><div>${esc(S.d.label)}</div><button id="changeD" class="tab mt-2">${esc(t('change'))}</button></div>`);
        $('changeD').onclick = () => {
          $('destinationBox').classList.remove('hidden');
          put('destinationSummary', '');
        };
      };
    });
  }

  function stopIds(group) {
    return (group?.stops || []).map((x) => x.stop);
  }

  function kindLabel(kind) {
    if (kind === 'stay') return t('stay');
    if (kind === 'direct') return t('direct');
    if (kind === 'same_stop') return t('sameStop');
    return t('transferKind');
  }

  function emptyTransferKey(reason) {
    if (reason === 'no_first_bus') return 'noFirstBus';
    if (reason === 'no_connection') return 'noConnection';
    if (reason === 'no_departure' || reason === 'empty') return 'noLiveNow';
    if (reason === 'timeout') return 'timeout';
    if (reason === 'incomplete') return 'incomplete';
    if (reason === 'need_board') return 'needBoard';
    return 'none';
  }

  function transferItemHtml(x, i, phase, extra = {}) {
    const dest = loc(x.dest);
    const disc = x.discount ? `<div class="muted"><span class="badge">${esc(t('octopusDiscount'))}</span> ${esc(S.lang === 'zh' ? x.discount.notes_zh : x.discount.notes_en)} ${esc(t('discountNote'))}</div>` : '';
    const badge = extra.watching ? t('watchingConnection') : (x.recommended ? t('recommended') : (phase === 'connections' && i > 0 ? t('backup') : kindLabel(x.kind)));
    const coMark = serviceCo(x) !== 'KMB' ? ` <span class="badge">${esc(coBadge(x))}</span>` : '';
    const hint = extra.pickHint ? `<div class="muted">${esc(t('pickConnection'))}</div>` : '';
    const inner = `<span class="badge">${esc(badge)}</span>${coMark} <b>${esc(x.route)}</b>${dest ? `<div>${esc(t('towards'))}${S.lang === 'zh' ? '' : ' '}${esc(dest)}</div>` : ''}<div>${esc(loc(x.from))} → ${esc(loc(x.to))}</div><div class="eta"><b>${esc(clk(x.eta))}</b><span class="mins">${esc(t('minutes', mins(x.eta)))}</span></div>${x.kind === 'transfer' && x.waitAfterFirstMinutes != null ? `<div class="muted">${esc(t('waitAfter', x.waitAfterFirstMinutes))}</div>` : ''}${fareNote(x)}${disc}${hint}`;
    if (extra.choice) return `<button class="item choice" type="button" data-conn="${i}">${inner}</button>`;
    return `<div class="item">${inner}</div>`;
  }

  function bindSaveTransfer(inter, boardVal) {
    const btn = $('saveTransfer');
    if (!btn) return;
    btn.onclick = () => saveHome({
      type: 'transfer',
      title: { zh: `${S.f.route} → ${S.d.label}`, en: `${S.f.route} → ${S.d.label}` },
      subtitle: { zh: `${inter.label} 轉車`, en: `Transfer at ${inter.label}` },
      payload: {
        first: S.f,
        boardIndex: boardVal,
        interchangeIndex: $('interchange').value,
        destLabel: S.d.label,
        destStops: stopIds(S.d),
        nearby: $('nearby').checked,
        radius: $('radius').value
      }
    });
  }

  function showChosenDirect(x, inter, boardVal) {
    S.chosenDirect = x;
    S.transferPhase = 'direct';
    put('transferOutput', `<div class="note">${esc(t('chosenDirect'))}</div>${transferItemHtml(x, 0, 'direct')}<button id="changeDeparture" class="tab mt-2">${esc(t('changeDeparture'))}</button><div class="row-actions"><button id="saveTransfer" class="tab">${esc(t('saveHome'))}</button></div>`);
    $('changeDeparture').onclick = () => startTransfer({ phase: 'departures' });
    bindSaveTransfer(inter, boardVal);
  }

  function renderDepartures(json, inter, boardVal) {
    const deps = (json.departures || []).map((row, i) => {
      const dest = loc(row.dest);
      return `<button class="item choice" type="button" data-dep="${i}"><b>${esc(S.f.route)}</b>${dest ? `<div>${esc(t('towards'))}${S.lang === 'zh' ? '' : ' '}${esc(dest)}</div>` : ''}${fareNote(json.firstFare || S.f)}<div class="eta"><b>${esc(clk(row.eta))}</b><span class="mins">${esc(t('minutes', mins(row.eta)))}</span></div><div class="muted">${esc(t('pickDeparture'))}</div></button>`;
    }).join('');
    const depEmpty = deps || `<p class="muted">${esc(t(emptyTransferKey(json.emptyReason || 'no_departure')))}</p>`;
    const directs = (json.directs || []).map((x, i) => {
      const dest = loc(x.dest);
      return `<button class="item choice" type="button" data-direct="${i}"><span class="badge">${esc(kindLabel(x.kind))}</span> <b>${esc(x.route)}</b>${dest ? `<div>${esc(t('towards'))}${S.lang === 'zh' ? '' : ' '}${esc(dest)}</div>` : ''}<div>${esc(loc(x.from))} → ${esc(loc(x.to))}</div>${fareNote(x)}<div class="eta"><b>${esc(clk(x.eta))}</b><span class="mins">${esc(t('minutes', mins(x.eta)))}</span></div></button>`;
    }).join('');
    put('transferOutput', `<h3 class="font-bold mt-4">${esc(t('firstDepartures'))}</h3>${depEmpty}<h3 class="font-bold mt-4">${esc(t('directHeading'))}</h3>${directs || `<p class="muted">${esc(t('noDirect'))}</p>`}<div class="row-actions"><button id="saveTransfer" class="tab">${esc(t('saveHome'))}</button></div>`);
    $('transferOutput').querySelectorAll('[data-dep]').forEach((btn) => {
      btn.onclick = () => startTransfer({ phase: 'connections', selectedDeparture: json.departures[+btn.dataset.dep].eta });
    });
    $('transferOutput').querySelectorAll('[data-direct]').forEach((btn) => {
      btn.onclick = () => showChosenDirect(json.directs[+btn.dataset.direct], inter, boardVal);
    });
    bindSaveTransfer(inter, boardVal);
  }

  function renderConnections(json, inter, boardVal) {
    const empty = json.emptyReason && !json.list?.length
      ? `<p class="muted">${esc(t(emptyTransferKey(json.emptyReason)))}</p>`
      : '';
    const arrivalNote = json.firstArrivalAtInterchange
      ? `<div class="note"><h3 class="font-bold">${esc(t('firstArrival'))}</h3><div class="eta mt-2"><b>${esc(clk(json.firstArrivalAtInterchange))}</b><span class="mins">${esc(t('minutes', mins(json.firstArrivalAtInterchange)))}</span></div>${fareNote(json.firstFare || S.f)}${json.boardDeparture ? `<div class="muted mt-2">${esc(t('boardAt'))}：${esc(clk(json.boardDeparture))}</div>` : ''}${json.arrivalEstimated ? `<div class="muted mt-2">${esc(t('firstArrivalGuessed'))}</div>` : ''}${stopTimesBlock('transfer-first', json.firstStops)}</div>`
      : '';
    const change = `<button id="changeDeparture" class="tab mt-2">${esc(t('changeDeparture'))}</button>`;
    const watch = json.watch;
    const watchNote = (watch?.selected || S.selectedConnection)
      ? `<div class="note mt-4"><h3 class="font-bold">${esc(t('watchingConnection'))}</h3><p class="muted mt-2">${esc(t('watchingLive'))}</p>${watch?.selected ? transferItemHtml(watch.selected, 0, 'connections', { watching: true }) : ''}<p class="${watch?.catchable ? 'mt-2' : 'muted mt-2'}">${esc(watch?.catchable ? t('stillCatchable') : t('missedConnection'))}</p>${watch?.earlier ? `<p class="mt-2">${esc(t('earlierConnection'))}</p>${transferItemHtml(watch.earlier, 0, 'connections')}<button id="switchEarlier" class="tab mt-2">${esc(t('switchToEarlier'))}</button>` : ''}<button id="changeConnection" class="tab mt-2">${esc(t('changeConnection'))}</button></div>`
      : '';
    const rows = (json.list || []).map((x, i) => transferItemHtml(x, i, 'connections', {
      choice: true,
      pickHint: !S.selectedConnection,
      watching: S.selectedConnection && String(S.selectedConnection.route).toUpperCase() === String(x.route).toUpperCase() && (S.selectedConnection.co || 'KMB') === (x.co || 'KMB')
    })).join('');
    put('transferOutput', `${arrivalNote}${change}${watchNote}<h3 class="font-bold mt-4">${esc(t('combinedList'))}</h3>${rows || empty}<div class="row-actions"><button id="saveTransfer" class="tab">${esc(t('saveHome'))}</button></div>`);
    if ($('changeDeparture')) $('changeDeparture').onclick = () => {
      S.selectedConnection = null;
      startTransfer({ phase: 'departures' });
    };
    if ($('changeConnection')) $('changeConnection').onclick = () => {
      S.selectedConnection = null;
      startTransfer({ phase: 'connections', selectedConnection: null, silent: true });
    };
    if ($('switchEarlier') && watch?.earlier) {
      $('switchEarlier').onclick = () => startTransfer({ phase: 'connections', selectedConnection: watch.earlier, silent: true });
    }
    $('transferOutput').querySelectorAll('[data-conn]').forEach((btn) => {
      btn.onclick = () => {
        const item = json.list[+btn.dataset.conn];
        if (!item) return;
        startTransfer({ phase: 'connections', selectedConnection: item, silent: true });
      };
    });
    bindStopTimes($('transferOutput'), {
      paint: () => renderConnections(json, inter, boardVal),
      stops: () => json.firstStops
    });
    bindSaveTransfer(inter, boardVal);
  }

  async function stopAllEtas(stop) {
    try {
      if ((stop.co || '') === 'GMB') {
        const data = await gov(`${GMB}/eta/stop/${encodeURIComponent(stop.stop)}`);
        const blocks = Array.isArray(data) ? data : (data ? [data] : []);
        const out = [];
        for (const block of blocks) {
          for (const eta of block.eta || []) {
            if (eta.timestamp) out.push({ eta: eta.timestamp, route: block.route_code, co: 'GMB', gmb_route_id: block.route_id, dest_tc: block.dest_tc, dest_en: block.dest_en });
          }
        }
        return out;
      }
      if ((stop.co || '') === 'CTB' || /^\d{6}$/.test(String(stop.stop || ''))) {
        const res = await fetch(`https://rt.data.gov.hk/v1/transport/batch/stop-eta/CTB/${encodeURIComponent(stop.stop)}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000)
        });
        const json = await res.json().catch(() => ({}));
        return (json.data || []).filter((x) => x.eta).map((x) => ({ ...x, co: 'CTB', service_type: '1' }));
      }
      const data = await gov(`${KMB}/stop-eta/${encodeURIComponent(stop.stop)}`);
      return (data || []).filter((x) => x.eta).map((x) => ({ ...x, co: x.co || 'KMB' }));
    } catch {
      return [];
    }
  }

  async function liveAtStops(stopList) {
    const slice = (stopList || []).slice(0, 12);
    const lists = await mapPool(slice, 8, (stop) => stopAllEtas(stop));
    const rows = [];
    slice.forEach((stop, i) => {
      for (const etaRow of lists[i] || []) {
        if (etaRow?.eta) rows.push({ eta: etaRow, stop });
      }
    });
    return rows;
  }

  async function transferDirect(opts) {
    const phase = opts.phase;
    const first = opts.first;
    const nearby = !!opts.nearby;
    const radius = Number(opts.radius) || 250;
    const seq = await stops(first);
    const boardSeeds = resolveStops(opts.boardStops);
    const interSeeds = resolveStops(opts.interchangeStops);
    const destSeeds = resolveStops(opts.destinationStops);
    if (!interSeeds.length || !destSeeds.length || !boardSeeds.length) {
      return { phase, departures: [], directs: [], list: [], emptyReason: boardSeeds.length ? 'incomplete' : 'need_board' };
    }
    const boarding = nearby ? expandNearby(boardSeeds, radius) : boardSeeds;
    const interchange = nearby ? expandNearby(interSeeds, radius) : interSeeds;
    const destinations = nearby ? expandNearby(destSeeds, radius) : destSeeds;
    const destIds = new Set(destinations.map((row) => row.stop));
    const boardIds = new Set(boarding.map((row) => row.stop));
    const interIds = new Set(interchange.map((row) => row.stop));
    const sameStartAndTransfer = [...boardIds].some((id) => interIds.has(id));
    const boardIdx = seq.findIndex((row) => boardIds.has(row.stop));
    const interIdx = seq.findIndex((row, i) => i >= Math.max(boardIdx, 0) && interIds.has(row.stop));
    if (boardIdx < 0 || interIdx < boardIdx) {
      return { phase, departures: [], directs: [], list: [], emptyReason: 'incomplete' };
    }
    const destOnFirst = seq.findIndex((row, i) => i > Math.max(interIdx, boardIdx, 0) && matchesDest(row, destinations, destIds));
    const alightStop = seq[interIdx];
    const firstAlightIds = new Set(alightStop?.stop ? [alightStop.stop] : []);
    const dest = namedDest(first);
    const boardOnFirst = seq.filter((row) => boardIds.has(row.stop)).slice(0, 8);
    const boardEtaLists = await mapPool(boardOnFirst, 6, (row) => eta(row.stop, first));
    const boardEtas = cluster(boardEtaLists.flat().map((row) => row.eta).filter(Boolean));

    async function collectMatches(kindFilter) {
      const liveStops = kindFilter === 'direct' ? boarding : interchange;
      const live = await liveAtStops(liveStops);
      const candidateList = groupCandidates(live).slice(0, 24);
      const sequences = await mapPool(candidateList, 6, (candidate) => stops({
        co: candidate.co || 'KMB',
        route: candidate.route,
        bound: (candidate.bound === 'I' || candidate.bound === 'INBOUND') ? 'I' : 'O',
        service_type: candidate.service_type || '1'
      }).catch(() => []));
      const out = [];
      candidateList.forEach((candidate, idx) => {
        const nextSeq = sequences[idx] || [];
        if (!nextSeq.length || isFirstRoute(candidate, first)) return;
        for (const entry of candidate.entries) {
          const match = servesAfter(nextSeq, entry.stop.stop, destinations, destIds);
          if (!match) continue;
          const atBoard = boardIds.has(entry.stop.stop);
          const atInter = interIds.has(entry.stop.stop);
          if (kindFilter === 'direct') {
            const sameStop = atBoard && atInter;
            let kind = null;
            if (sameStop || (sameStartAndTransfer && atInter)) kind = 'same_stop';
            else if (atBoard && !atInter) kind = 'direct';
            if (!kind) continue;
            addUnique(out, connectionRow(kind, candidate, entry, match, { waitAfterFirstMinutes: null }), firstAlightIds);
            continue;
          }
          if (!atInter) continue;
          const etaMs = new Date(entry.eta.eta).getTime();
          const walk = walkMs(alightStop, entry.stop);
          if (Number.isFinite(etaMs) && etaMs < connectAfter + walk) continue;
          addUnique(out, connectionRow('transfer', candidate, entry, match, {
            waitAfterFirstMinutes: Math.max(0, Math.round((etaMs - connectAfter) / 60000))
          }), firstAlightIds);
        }
      });
      return out;
    }

    if (phase === 'departures') {
      const departures = boardEtas.map((time) => ({ eta: time, dest, route: first.route }));
      const directs = (await collectMatches('direct')).sort((a, b) => new Date(a.eta) - new Date(b.eta));
      return {
        phase: 'departures',
        departures,
        directs,
        list: [],
        emptyReason: departures.length ? null : 'no_departure'
      };
    }

    const boardDeparture = opts.picked || boardEtas[0] || null;
    if (!boardDeparture) {
      return { phase: 'connections', firstArrivalAtInterchange: null, list: [], emptyReason: 'no_first_bus' };
    }
    const tables = await firstRouteEtaTables(first, seq, boardIdx, interIdx);
    const followed = await followBusAlongRoute(seq, boardIdx, interIdx, tables, boardDeparture);
    let firstArrivalAtInterchange = followed.time;
    let arrivalEstimated = followed.estimated;
    let firstStops = followed.stops || [];
    if (!firstArrivalAtInterchange) {
      let travelMs = 0;
      for (let i = boardIdx; i < interIdx; i += 1) travelMs += hopTravelMs(metresBetween(seq[i], seq[i + 1]));
      firstArrivalAtInterchange = new Date(new Date(boardDeparture).getTime() + travelMs).toISOString();
      arrivalEstimated = true;
      firstStops = seq.slice(boardIdx, interIdx + 1).map((row, i) => ({
        stop: row.stop,
        name: namedStop(row),
        time: new Date(new Date(boardDeparture).getTime() + (i ? travelMs * (i / Math.max(1, interIdx - boardIdx)) : 0)).toISOString(),
        estimated: i > 0
      }));
    }
    const connectAfter = new Date(firstArrivalAtInterchange).getTime();
    const list = [];
    if (firstArrivalAtInterchange && destOnFirst > interIdx) {
      addUnique(list, {
        kind: 'stay',
        co: serviceCo(first),
        route: first.route,
        eta: firstArrivalAtInterchange,
        dest,
        from: namedStop(alightStop),
        to: namedStop(seq[destOnFirst]),
        waitAfterFirstMinutes: 0,
        fromStop: alightStop.stop,
        fromSeq: alightStop.seq,
        fromLat: alightStop.lat,
        fromLng: alightStop.long
      }, firstAlightIds);
    }
    list.push(...(await collectMatches('transfer')));
    const ranked = pickConnections(list);
    const watch = watchConnection(list, opts.selectedConnection, firstArrivalAtInterchange);
    if (watch?.selected && !ranked.some((row) => connectionWatchKey(row) === connectionWatchKey(watch.selected)
      && Math.abs(new Date(row.eta) - new Date(watch.selected.eta)) < 60000)) {
      ranked.push(watch.selected);
    }
    return {
      phase: 'connections',
      firstArrivalAtInterchange,
      firstStops,
      boardDeparture,
      arrivalEstimated,
      list: ranked,
      watch,
      emptyReason: ranked.length ? null : 'no_connection'
    };
  }

  async function startTransfer(opts = {}) {
    if (!S.f || !S.d || !$('interchange') || $('interchange').value === '') {
      put('transferOutput', `<div class="note">${esc(t('needFields'))}</div>`);
      return;
    }
    if ($('board') && $('board').value === '') {
      put('transferOutput', `<div class="note">${esc(t('needBoard'))}</div>`);
      return;
    }
    if ($('board') && $('interchange') && +$('interchange').value < +$('board').value) {
      put('transferOutput', `<div class="note">${esc(t('needFields'))}</div>`);
      return;
    }
    const phase = opts.phase
      || (S.transferPhase === 'connections' && S.selectedDeparture ? 'connections' : 'departures');
    const picked = Object.prototype.hasOwnProperty.call(opts, 'selectedDeparture')
      ? opts.selectedDeparture
      : (phase === 'connections' ? S.selectedDeparture : null);
    const watched = Object.prototype.hasOwnProperty.call(opts, 'selectedConnection')
      ? opts.selectedConnection
      : (phase === 'connections' ? S.selectedConnection : null);
    const seq = ++transferSeq;
    S.chosenDirect = null;
    const silent = !!opts.silent;
    if (!silent) put('transferOutput', `<div class="note">${esc(phase === 'departures' ? t('searchingDepartures') : t('searching'))}</div>`);
    try {
      const inter = S.fg[+$('interchange').value];
      const boardVal = $('board').value;
      const json = await hasBackend()
        ? await api('/api/transfer', {
          method: 'POST',
          body: JSON.stringify({
            phase,
            selectedDeparture: picked || undefined,
            selectedConnection: watched || undefined,
            nearby: $('nearby').checked,
            radius: +$('radius').value,
            first: S.f,
            boardStops: boardVal === '' ? [] : stopIds(S.fg[+boardVal]),
            interchangeStops: stopIds(inter),
            destinationStops: stopIds(S.d)
          })
        })
        : await transferDirect({
          phase,
          picked,
          first: S.f,
          boardStops: boardVal === '' ? [] : stopIds(S.fg[+boardVal]),
          interchangeStops: stopIds(inter),
          destinationStops: stopIds(S.d),
          selectedConnection: watched,
          nearby: $('nearby').checked,
          radius: +$('radius').value
        });
      if (seq !== transferSeq) return;
      S.transferPhase = json.phase || phase;
      S.selectedDeparture = phase === 'departures' ? null : (json.boardDeparture || picked || null);
      if (phase === 'departures') S.selectedConnection = null;
      else if (json.watch?.selected) S.selectedConnection = json.watch.selected;
      else if (Object.prototype.hasOwnProperty.call(opts, 'selectedConnection')) S.selectedConnection = opts.selectedConnection;
      S.last = 't';
      if ((json.phase || phase) === 'departures') renderDepartures(json, inter, boardVal);
      else renderConnections(json, inter, boardVal);
    } catch (e) {
      if (seq !== transferSeq) return;
      if (!silent) put('transferOutput', `<div class="note">${esc(e.message || t('none'))}</div>`);
    }
  }

  async function go() {
    S.selectedDeparture = null;
    S.selectedConnection = null;
    S.transferPhase = null;
    S.chosenDirect = null;
    await startTransfer({ phase: 'departures', selectedDeparture: null, selectedConnection: null });
  }

  function lineName(line) {
    return loc(line.name) || line.name;
  }

  function stationLabel(row) {
    return S.lang === 'zh' ? row[1] : row[2];
  }

  function rideDestStations(line, origin, lineKey) {
    if (lineKey === 'LRT') {
      const termini = globalThis.TB_LRT_TERMINI || [];
      return termini.filter((row) => row[0] !== origin);
    }
    const stations = line?.stations || [];
    const routes = line?.routes;
    if (!routes?.length) return stations.filter((row) => row[0] !== origin);
    const seen = new Set();
    const out = [];
    const byCode = new Map(stations.map((row) => [row[0], row]));
    for (const path of routes) {
      const i = path.indexOf(origin);
      if (i < 0) continue;
      for (const code of path) {
        if (code === origin || seen.has(code)) continue;
        seen.add(code);
        if (byCode.has(code)) out.push(byCode.get(code));
      }
    }
    return out;
  }

  function mtrPref() {
    try {
      const raw = JSON.parse(localStorage.getItem(MTR_PREF_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }

  function saveMtrPref() {
    try {
      localStorage.setItem(MTR_PREF_KEY, JSON.stringify({
        line: $('mtrLine')?.value || '',
        station: $('mtrStation')?.value || '',
        dest: $('mtrDest')?.value || ''
      }));
    } catch {}
  }

  function mtrLineEntries() {
    return Object.entries(S.lines).sort(([a], [b]) => (a === 'LRT' ? -1 : b === 'LRT' ? 1 : 0));
  }

  function mtrInit() {
    const entries = mtrLineEntries();
    if (!entries.length) return;
    const currentLine = $('mtrLine').value;
    const currentSta = $('mtrStation').value;
    const currentDest = $('mtrDest')?.value;
    const pref = mtrPref();
    put('mtrLine', entries.map(([k, v]) => `<option value="${k}">${esc(lineName(v))}</option>`).join(''));
    const pick = (currentLine && S.lines[currentLine] && currentLine)
      || (pref.line && S.lines[pref.line] && pref.line)
      || (S.lines.LRT ? 'LRT' : entries[0][0]);
    $('mtrLine').value = pick;
    mtrStations();
    const staKeep = currentSta || pref.station;
    if (staKeep && S.lines[pick]?.stations.some((row) => row[0] === staKeep)) $('mtrStation').value = staKeep;
    fillMtrDest();
    const destKeep = currentDest || pref.dest;
    if (destKeep && $('mtrDest') && [...$('mtrDest').options].some((o) => o.value === destKeep)) {
      $('mtrDest').value = destKeep;
    }
    $('mtrLine').onchange = () => { mtrStations(); fillMtrDest(); saveMtrPref(); mtr(); };
  }

  function mtrStations() {
    const line = S.lines[$('mtrLine').value];
    if (!line) return;
    const keep = $('mtrStation').value;
    put('mtrStation', line.stations.map((row) => `<option value="${row[0]}">${esc(stationLabel(row))}</option>`).join(''));
    if (keep && line.stations.some((row) => row[0] === keep)) $('mtrStation').value = keep;
    else $('mtrStation').value = line.stations[0]?.[0] || '';
    $('mtrStation').onchange = () => { fillMtrDest(); saveMtrPref(); mtr(); };
    fillMtrDest();
  }

  function fillMtrDest() {
    const line = S.lines[$('mtrLine').value];
    const origin = $('mtrStation').value;
    const keep = $('mtrDest')?.value;
    const rows = rideDestStations(line, origin, $('mtrLine')?.value);
    put('mtrDest', `<option value="">${esc(t('chooseRideDest'))}</option>${rows.map((row) => `<option value="${row[0]}">${esc(stationLabel(row))}</option>`).join('')}`);
    if (keep && keep !== origin && rows.some((row) => row[0] === keep)) $('mtrDest').value = keep;
    if ($('mtrDest')) $('mtrDest').onchange = () => { saveMtrPref(); mtr(); };
  }

  function paintMtr() {
    const l = $('mtrLine').value;
    const s = $('mtrStation').value;
    const d = $('mtrDest')?.value || '';
    const r = S.mtrResult;
    const match = r && r.line === l && r.sta === s;
    const waitHtml = S.mtrLoading ? `<p class="muted">${esc(t('mtrWait'))}</p>` : '';
    if (!match) {
      if (S.mtrLoading) put('mtrOutput', waitHtml);
      return;
    }
    const a = r.trains || [];
    let empty = t('noTrains');
    if (r.emptyReason === 'unavailable') empty = t('mtrUnavailable');
    else if (r.emptyReason === 'racecourse') empty = t('mtrRacecourse');
    else if (r.emptyReason === 'empty') empty = t('mtrEmptyLine');
    else if (r.emptyReason === 'no_dest') empty = t('mtrNoTrainToDest');
    const delay = r.delayed ? `<div class="note">${esc(t('mtrDelayed'))}</div>` : '';
    const destName = loc(r.dest);
    const destRide = !!(destName && !r.destRelaxed);
    const list = a.length
      ? a.map((x, i) => {
        const wait = x.arrive ? (x.arriveMinutes ?? mins(x.arrive)) : (x.minutes != null ? x.minutes : mins(x.time));
        const when = x.time ? clk(x.time) : '';
        const plat = x.platform ? t('platform', x.platform) : '';
        const official = x.line === 'LRT' ? loc(x.timeText) : '';
        const clockLine = [when, plat, official && !/\d/.test(official) ? official : ''].filter(Boolean).join(' · ');
        const routeBadge = x.route ? `<span class="badge">${esc(x.route)}</span> ` : '';
        const arrive = x.arrive && destRide
          ? `<div class="muted">${esc(clk(x.arrive))} ${esc(t('rideArrives'))}${S.lang === 'zh' ? '' : ' '}${esc(destName)}${x.rideMinutes != null ? ` · ${esc(t('rideMins', x.rideMinutes))}` : ''}</div>`
          : '';
        const guess = x.arrivalEstimated ? `<div class="muted">${esc(t('rideArriveGuessed'))}</div>` : '';
        const lineLabel = loc(x.lineName);
        const earliest = destRide && i === 0 ? `<span class="badge">${esc(t('earliestArrival'))}</span>` : '';
        const lineBadge = lineLabel ? `<span class="badge">${esc(lineLabel)}</span>` : '';
        const boarding = r.sta || s;
        const terminus = !!(x.terminus || (x.destCode && x.destCode === boarding));
        const fetchable = !terminus && !(x.stops && x.stops.length > 1);
        return `<div class="item"><div class="eta"><div>${earliest}${routeBadge}${lineBadge}<b>${esc(t('towards'))}${S.lang === 'zh' ? '' : ' '}${esc(loc(x.dest))}</b>${clockLine ? `<div class="muted">${esc(clockLine)}${destRide ? ` · ${esc(t('rideDeparts'))}` : ''}</div>` : ''}${arrive}${guess}</div><span class="mins">${wait == null ? '' : esc(t('minutes', wait))}</span></div>${x.line === 'LRT' ? '' : stopTimesBlock(`mtr-${i}`, terminus ? { terminus: true } : x.stops, fetchable)}</div>`;
      }).join('') + (a[0]?.line === 'LRT' ? `<p class="muted">${esc(r.destRelaxed ? t('lrtDestNotTerminus') : t('lrtThisStop'))}</p>` : '')
      : `<p class="muted">${esc(empty)}</p>`;
    put('mtrOutput', waitHtml + delay + list + `<div class="row-actions"><button id="saveMtr" class="tab">${esc(t('saveHome'))}</button></div>`);
    const destRow = d ? S.lines[l].stations.find((row) => row[0] === d) : null;
    $('saveMtr').onclick = () => saveHome({
      type: 'mtr',
      title: { zh: `${lineName(S.lines[l])} · ${S.lines[l].stations.find((row) => row[0] === s)[1]}`, en: `${S.lines[l].name.en} · ${S.lines[l].stations.find((row) => row[0] === s)[2]}` },
      subtitle: destRow
        ? { zh: `${S.lines[l].stations.find((row) => row[0] === s)[1]} → ${destRow[1]}`, en: `${S.lines[l].stations.find((row) => row[0] === s)[2]} → ${destRow[2]}` }
        : { zh: t('nextTrains'), en: 'Next trains' },
      payload: { line: l, station: s, dest: d || undefined }
    });
    bindStopTimes($('mtrOutput'), {
      paint: paintMtr,
      stops: (id) => {
        const train = a[+id.slice(4)];
        if (train?.terminus || (train?.destCode && train.destCode === (r.sta || s))) return { terminus: true };
        return train?.stops;
      },
      load: async (id) => {
        if (S.fetchedStops[id] === 'loading' || S.fetchedStops[id]?.terminus || (Array.isArray(S.fetchedStops[id]) && S.fetchedStops[id].length)) return;
        const train = a[+id.slice(4)];
        const boarding = r.sta || s;
        if (!train?.destCode) {
          S.fetchedStops[id] = [];
          return;
        }
        if (train.terminus || train.destCode === boarding) {
          S.fetchedStops[id] = { terminus: true };
          return;
        }
        S.fetchedStops[id] = 'loading';
        paintMtr();
        try {
          const json = await api(`/api/mtr/schedule?line=${encodeURIComponent(train.line || l)}&sta=${encodeURIComponent(boarding)}&dest=${encodeURIComponent(train.destCode)}&sameLine=1`);
          const hit = pickFollowedTrain(json.trains || [], { ...train, line: train.line || l });
          S.fetchedStops[id] = hit?.terminus ? { terminus: true } : (hit?.stops || []);
        } catch {
          S.fetchedStops[id] = [];
        }
      }
    });
  }

  async function mtr() {
    const l = $('mtrLine').value;
    const s = $('mtrStation').value;
    const d = $('mtrDest')?.value || '';
    if (!l || !s) return;
    saveMtrPref();
    S.mtrLoading = true;
    paintMtr();
    try {
      if (await hasBackend()) {
        S.mtrResult = await api(`/api/mtr/schedule?line=${encodeURIComponent(l)}&sta=${encodeURIComponent(s)}${d && d !== s ? `&dest=${encodeURIComponent(d)}` : ''}`);
      } else {
        const payload = await fetchMtr(l, s);
        const base = normalizeMtr(payload, l, s);
        if (d && d !== s) {
          const keys = [...new Set([l, ...linesServing(s, d)])].slice(0, 4);
          const parts = await mapPool(keys, 3, (line) => mtrFollowLine(line, s, d, line === l ? base : null));
          const delayed = parts.some((part) => part.delayed);
          const trains = parts
            .flatMap((part) => part.trains || [])
            .sort((a, b) => (trainMs({ time: a.arrive }) ?? trainMs(a) ?? 0) - (trainMs({ time: b.arrive }) ?? trainMs(b) ?? 0));
          const unavailable = parts.every((part) => part.emptyReason === 'unavailable');
          let emptyReason = null;
          if (!trains.length) {
            if (unavailable) emptyReason = 'unavailable';
            else if (parts.every((part) => part.emptyReason === 'no_dest' || part.emptyReason === 'unavailable')) emptyReason = 'no_dest';
            else if (s === 'RAC') emptyReason = 'racecourse';
            else emptyReason = parts.find((part) => part.emptyReason)?.emptyReason || 'empty';
          }
          S.mtrResult = {
            ...base,
            delayed: delayed || base.delayed,
            dest: mtrStationName(d),
            trains,
            emptyReason
          };
        } else {
          S.mtrResult = base;
        }
      }
      S.mtrResult = { ...S.mtrResult, line: l, sta: s };
      S.mtrLoading = false;
      paintMtr();
      S.last = 'm';
    } catch {
      S.mtrLoading = false;
      put('mtrOutput', `<p class="muted">${esc(t('mtrUnavailable'))}</p>`);
    }
  }

  async function saveHome(item) {
    if (await hasBackend()) {
      await api('/api/homes', { method: 'POST', body: JSON.stringify(item) });
    } else {
      const rows = localHomes();
      rows.unshift({
        ...item,
        id: crypto.randomUUID(),
        pinned: false,
        created_at: new Date().toISOString()
      });
      saveLocalHomes(rows.slice(0, 40));
    }
    tabs('home');
    renderHome();
  }

  function typeLabel(type) {
    if (type === 'arrival') return t('typeArrival');
    if (type === 'transfer') return t('typeTransfer');
    if (type === 'mtr') return t('typeMtr');
    return type;
  }

  async function renderHome() {
    try {
      const rows = await hasBackend()
        ? ((await api('/api/homes')).data || [])
        : localHomes().sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
      if (!rows.length) {
        put('homeOutput', `<p class="muted mt-3">${esc(t('homeEmpty'))}</p>`);
        return;
      }
      put('homeOutput', rows.map((item) =>
        `<div class="item"><b>${esc(loc(item.title))}</b>${item.pinned ? `<span class="badge">${esc(t('pin'))}</span>` : ''}<div class="muted">${esc(loc(item.subtitle))} · ${esc(typeLabel(item.type))}</div><div class="row-actions"><button class="btn" data-open="${item.id}">${esc(t('open'))}</button><button class="tab" data-pin="${item.id}" data-pinned="${item.pinned ? '1' : '0'}">${esc(item.pinned ? t('unpin') : t('pin'))}</button><button class="tab" data-del="${item.id}">${esc(t('remove'))}</button></div></div>`
      ).join(''));
      $('homeOutput').querySelectorAll('[data-open]').forEach((b) => {
        b.onclick = () => openHome(rows.find((x) => x.id === b.dataset.open));
      });
      $('homeOutput').querySelectorAll('[data-pin]').forEach((b) => {
        b.onclick = async () => {
          if (await hasBackend()) {
            await api(`/api/homes/${b.dataset.pin}`, { method: 'PATCH', body: JSON.stringify({ pinned: b.dataset.pinned !== '1' }) });
          } else {
            saveLocalHomes(localHomes().map((row) => row.id === b.dataset.pin ? { ...row, pinned: b.dataset.pinned !== '1' } : row));
          }
          renderHome();
        };
      });
      $('homeOutput').querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = async () => {
          if (await hasBackend()) {
            await api(`/api/homes/${b.dataset.del}`, { method: 'DELETE' });
          } else {
            saveLocalHomes(localHomes().filter((row) => row.id !== b.dataset.del));
          }
          renderHome();
        };
      });
    } catch (error) {
      put('homeOutput', `<div class="note">${esc(error.message)}</div>`);
    }
  }

  async function openHome(item) {
    if (!item) return;
    if (item.type === 'arrival') {
      tabs('arrivals');
      await pickA(item.payload.service);
      $('arrivalStop').value = String(item.payload.stopIndex);
      fillArrivalDest();
      if (item.payload.destIndex != null && item.payload.destIndex !== '' && $('arrivalDest')) {
        $('arrivalDest').value = String(item.payload.destIndex);
      }
      await showA();
    } else if (item.type === 'transfer') {
      tabs('transfer');
      $('nearby').checked = item.payload.nearby !== false;
      $('radius').value = String(item.payload.radius || '250');
      await pickF(item.payload.first, { board: item.payload.boardIndex ?? '', inter: item.payload.interchangeIndex });
      S.d = {
        label: item.payload.destLabel,
        stops: (item.payload.destStops || []).map((id) => S.map.get(id)).filter(Boolean)
      };
      $('destinationBox').classList.add('hidden');
      put('destinationSummary', `<div class="note"><b>${esc(t('destArea'))}</b><div>${esc(S.d.label)}</div><button id="changeD" class="tab mt-2">${esc(t('change'))}</button></div>`);
      $('changeD').onclick = () => {
        $('destinationBox').classList.remove('hidden');
        put('destinationSummary', '');
      };
      await go();
    } else if (item.type === 'mtr') {
      tabs('mtr');
      $('mtrLine').value = item.payload.line;
      mtrStations();
      $('mtrStation').value = item.payload.station;
      fillMtrDest();
      if (item.payload.dest) $('mtrDest').value = item.payload.dest;
      await mtr();
    }
  }

  function tabs(id) {
    S.tab = id;
    document.querySelectorAll('.tab').forEach((x) => {
      if (x.dataset.tab) x.classList.toggle('active', x.dataset.tab === id);
    });
    document.querySelectorAll('.panel').forEach((x) => x.classList.toggle('active', x.id === id));
    if (id === 'home') renderHome();
    if (id === 'guide') paintGuide();
    if (id === 'mtr') mtr();
  }

  function paintGuide() {
    const guide = (typeof GUIDE !== 'undefined' && GUIDE[S.lang]) ? GUIDE[S.lang] : GUIDE?.zh;
    if (!$('guideCard') || !guide) return;
    $('guideCard').innerHTML = `<h2 class="text-lg font-bold">${esc(guide.title)}</h2><p class="muted mt-2">${esc(guide.intro)}</p><p class="mt-3"><a class="tab" href="/user-manual.pdf" target="_blank" rel="noreferrer">${esc(guide.pdf)}</a></p>${guide.sections.map((section) => `<div class="mt-4"><h3 class="font-bold">${esc(section.h)}</h3>${section.p.map((para) => `<p class="muted mt-2">${esc(para)}</p>`).join('')}</div>`).join('')}`;
  }

  function auto() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (S.tab === 'arrivals' && S.last === 'a' && $('arrivalStop') && $('arrivalStop').value !== '') showA();
      if (S.tab === 'transfer' && S.last === 't' && !S.chosenDirect) startTransfer({ silent: true });
      if (S.tab === 'mtr' && S.last === 'm') mtr();
    }, +$('refresh').value * 1000);
  }

  $('langBtn').onclick = async () => {
    S.lang = S.lang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('tb-lang', S.lang);
    applyStatic();
    paintGuide();
    await refreshDynamic();
  };
  if ($('guideBtn')) $('guideBtn').onclick = () => tabs('guide');
  $('arrivalFind').onclick = () => choices('arrivalVariants', $('arrivalRoute').value, pickA);
  $('firstFind').onclick = () => choices('firstVariants', $('firstRoute').value, pickF);
  $('destinationFind').onclick = dest;
  $('transferFind').onclick = go;
  $('mtrFind').onclick = mtr;
  $('refresh').onchange = auto;
  if ('serviceWorker' in navigator && (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  $('arrivalRoute').oninput = () => {
    if (S.restoringArrival) return;
    clearTimeout(deb);
    deb = setTimeout(() => $('arrivalFind').click(), 500);
  };
  $('firstRoute').oninput = () => { clearTimeout(deb); deb = setTimeout(() => $('firstFind').click(), 500); };
  $('destinationInput').oninput = () => { clearTimeout(deb); deb = setTimeout(dest, 500); };
  document.querySelectorAll('.tab').forEach((x) => {
    if (x.dataset.tab) x.onclick = () => tabs(x.dataset.tab);
  });
  applyStatic();
  auto();
  load();
})();
