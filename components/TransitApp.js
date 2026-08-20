'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I18N } from '../lib/i18n.js';

function deviceId() {
  let id = localStorage.getItem('tb-device');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('tb-device', id);
  }
  return id;
}

function n(x) {
  return String(x || '').trim().toUpperCase();
}

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

function cluster(a) {
  a = [...new Set(a)].sort((x, y) => new Date(x) - new Date(y));
  return a.filter((x, i) => !i || new Date(x) - new Date(a[i - 1]) > 90000);
}

function emptyReasonKey(reason) {
  if (reason === 'no_first_bus') return 'noFirstBus';
  if (reason === 'no_connection') return 'noConnection';
  if (reason === 'no_departure') return 'noDeparture';
  if (reason === 'timeout') return 'timeout';
  if (reason === 'incomplete') return 'incomplete';
  if (reason === 'need_board') return 'needBoard';
  if (reason === 'empty' || reason === 'no_departure') return 'noLiveNow';
  return 'none';
}

export default function TransitApp() {
  const [lang, setLang] = useState('zh');
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [lines, setLines] = useState({});
  const [dirCount, setDirCount] = useState(null);
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState('arrivals');
  const [refreshSec, setRefreshSec] = useState('30');

  const [arrivalRoute, setArrivalRoute] = useState('');
  const [arrivalChoices, setArrivalChoices] = useState(null);
  const [arrivalService, setArrivalService] = useState(null);
  const [arrivalGroups, setArrivalGroups] = useState([]);
  const [arrivalStopIndex, setArrivalStopIndex] = useState('');
  const [arrivalDestIndex, setArrivalDestIndex] = useState('');
  const [arrivalTimes, setArrivalTimes] = useState(null);

  const [nearby, setNearby] = useState(true);
  const [radius, setRadius] = useState('250');
  const [firstRoute, setFirstRoute] = useState('');
  const [firstChoices, setFirstChoices] = useState(null);
  const [firstService, setFirstService] = useState(null);
  const [firstGroups, setFirstGroups] = useState([]);
  const [firstBoxHidden, setFirstBoxHidden] = useState(false);
  const [boardIndex, setBoardIndex] = useState('');
  const [interchangeIndex, setInterchangeIndex] = useState('');
  const [destinationInput, setDestinationInput] = useState('');
  const [destinationResults, setDestinationResults] = useState(null);
  const [destination, setDestination] = useState(null);
  const [destBoxHidden, setDestBoxHidden] = useState(false);
  const [transferResult, setTransferResult] = useState(null);
  const [transferMessage, setTransferMessage] = useState('');
  const [transferPhase, setTransferPhase] = useState(null);
  const [selectedDeparture, setSelectedDeparture] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [chosenDirect, setChosenDirect] = useState(null);

  const [mtrLine, setMtrLine] = useState('');
  const [mtrStation, setMtrStation] = useState('');
  const [mtrDest, setMtrDest] = useState('');
  const [mtrResult, setMtrResult] = useState(null);
  const [openStopKey, setOpenStopKey] = useState(null);
  const [fetchedStops, setFetchedStops] = useState({});

  const [homes, setHomes] = useState([]);
  const [homeError, setHomeError] = useState('');
  const [nearbyList, setNearbyList] = useState(null);
  const [nearbyBoard, setNearbyBoard] = useState(null);
  const [standaloneHint, setStandaloneHint] = useState(false);

  const stopCache = useRef(new Map());
  const lastView = useRef(null);
  const transferSeq = useRef(0);
  const homeOpened = useRef(false);
  const stopMap = useMemo(() => new Map(stops.map((x) => [x.stop, x])), [stops]);

  const t = useCallback((key, ...args) => {
    const value = I18N[lang][key];
    return typeof value === 'function' ? value(...args) : value;
  }, [lang]);

  const loc = useCallback((pair) => {
    if (!pair) return '';
    if (typeof pair === 'string') return pair;
    return lang === 'zh' ? (pair.zh || pair.en) : (pair.en || pair.zh);
  }, [lang]);

  const areaName = useCallback((x) => (
    lang === 'zh' ? (x.name_tc || x.name_en || '') : (x.name_en || x.name_tc || '')
  ), [lang]);

  const areaKey = (x) => (x.name_tc || x.name_en || '').normalize('NFKC').replace(/\s*\([^)]*\)\s*/g, '').replace(/[\s–—_.,'"-]+/g, '');

  const rn = useCallback((x) => (
    lang === 'zh'
      ? `${x.orig_tc || x.orig_en} → ${x.dest_tc || x.dest_en}`
      : `${x.orig_en || x.orig_tc} → ${x.dest_en || x.dest_tc}`
  ), [lang]);

  const mins = (x) => {
    const date = new Date(x);
    if (Number.isNaN(date.getTime())) return null;
    return Math.max(0, Math.ceil((date - Date.now()) / 60000));
  };
  const clk = useCallback((x) => {
    const date = new Date(x);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(lang === 'zh' ? 'zh-HK' : 'en-HK', { hour: 'numeric', minute: '2-digit' });
  }, [lang]);

  const api = useCallback(async (path, options = {}) => {
    const ctrl = new AbortController();
    const kill = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(path, {
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
  }, [t]);

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
    for (const x of routes) {
      if (serviceCo(x) === 'GMB') continue;
      const rank = routeMatchRank(q, x.route);
      if (rank >= 99) continue;
      const route = n(x.route);
      const cur = byRoute.get(route);
      if (!cur || rank < cur.rank) byRoute.set(route, { rank, route });
    }
    const names = [...byRoute.values()].sort((a, b) => a.rank - b.rank || a.route.length - b.route.length || a.route.localeCompare(b.route));
    const seen = new Set();
    const out = [];
    for (const { route } of names) {
      for (const x of routes) {
        if (n(x.route) !== route) continue;
        const k = [x.co || 'KMB', x.bound, x.service_type, x.orig_en, x.dest_en].join('|');
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(x);
        if (out.length >= 20) return out;
      }
    }
    return out;
  }

  async function fetchStops(s) {
    const k = [serviceCo(s), s.route, s.bound, s.service_type, s.gmb_route_id || '', s.gmb_route_seq || ''].join('|');
    if (stopCache.current.has(k)) return stopCache.current.get(k);
    if (serviceCo(s) === 'CTB') {
      const d = s.bound === 'I' ? 'inbound' : 'outbound';
      const json = await api(`/api/citybus/route-stop/${encodeURIComponent(s.route)}/${d}`);
      const rows = json.data || [];
      stopCache.current.set(k, rows);
      return rows;
    }
    if (serviceCo(s) === 'GMB' && s.gmb_route_id) {
      const json = await api(`/api/gmb/route-stop/${encodeURIComponent(s.gmb_route_id)}/${encodeURIComponent(s.gmb_route_seq || 1)}`);
      const rows = json.data || [];
      stopCache.current.set(k, rows);
      return rows;
    }
    const d = s.bound === 'O' ? 'outbound' : 'inbound';
    const json = await api(`/api/kmb/route-stop/${encodeURIComponent(s.route)}/${d}/${s.service_type}`);
    const rows = json.data || [];
    stopCache.current.set(k, rows);
    return rows;
  }

  async function eta(stopId, s, stopSeq) {
    try {
      if (serviceCo(s) === 'CTB') {
        const json = await api(`/api/citybus/eta/${encodeURIComponent(stopId)}/${encodeURIComponent(s.route)}`);
        return (json.data || []).filter((x) => x.eta).map((x) => ({ ...x, dir: s.bound, service_type: '1', route: s.route }));
      }
      if (serviceCo(s) === 'GMB') {
        const qs = new URLSearchParams();
        if (s.gmb_route_id) qs.set('routeId', s.gmb_route_id);
        if (s.gmb_route_seq) qs.set('routeSeq', s.gmb_route_seq);
        if (stopSeq) qs.set('stopSeq', String(stopSeq));
        if (s.route) qs.set('route', s.route);
        const json = await api(`/api/gmb/eta/${encodeURIComponent(stopId)}${qs.toString() ? `?${qs}` : ''}`);
        return (json.data || []).filter((x) => x.eta).map((x) => ({
          ...x,
          dir: x.dir || s.bound,
          service_type: '1',
          route: x.route || s.route,
          dest_tc: x.dest_tc || s.dest_tc,
          dest_en: x.dest_en || s.dest_en
        }));
      }
      const json = await api(`/api/kmb/stop-eta/${encodeURIComponent(stopId)}`);
      return (json.data || []).filter((x) =>
        n(x.route) === n(s.route)
        && String(x.service_type) === String(s.service_type)
        && x.dir === s.bound
        && x.eta
      );
    } catch {
      return [];
    }
  }

  async function routeLive(s, seq = []) {
    if (serviceCo(s) === 'GMB') {
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
      const json = await api(`/api/kmb/route-eta/${encodeURIComponent(s.route)}/${s.service_type}`);
      return (json.data || []).filter((x) => x.eta && x.dir === s.bound);
    } catch {
      return [];
    }
  }

  function destName(x) {
    return lang === 'zh' ? (x.dest_tc || x.dest_en || '') : (x.dest_en || x.dest_tc || '');
  }

  function mergeLiveChoices(keep) {
    const byJourney = new Map();
    for (const z of keep) {
      const k = serviceCo(z.x) === 'GMB'
        ? ['GMB', n(z.x.route), servicePlaceKey(z.x, 'orig'), servicePlaceKey(z.x, 'dest')].join('|')
        : ['BUS', n(z.x.route), z.x.bound, servicePlaceKey(z.x, 'orig'), servicePlaceKey(z.x, 'dest')].join('|');
      if (!byJourney.has(k)) byJourney.set(k, []);
      byJourney.get(k).push(z);
    }
    const journeys = [];
    for (const list of byJourney.values()) {
      const ranked = list.slice().sort((a, b) => {
        const aKmb = serviceCo(a.x) !== 'CTB' && serviceCo(a.x) !== 'GMB' ? 1 : 0;
        const bKmb = serviceCo(b.x) !== 'CTB' && serviceCo(b.x) !== 'GMB' ? 1 : 0;
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
      const k = [serviceCo(z.x) === 'GMB' ? 'GMB' : 'BUS', n(z.x.route), z.x.bound].join('|');
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

  async function loadChoices(routeStr) {
    let rows = matchBusServices(routeStr);
    try {
      const json = await api(`/api/gmb/lookup?route=${encodeURIComponent(n(routeStr))}`);
      rows = [...rows, ...(json.data || [])];
    } catch {}
    if (!rows.length) return { error: 'noRoute' };
    const info = await Promise.all(rows.map(async (x) => {
      let seq = [];
      let live = [];
      try { seq = await fetchStops(x); } catch {}
      try { live = await routeLive(x, seq); } catch {}
      return { x, live, seq };
    }));
    const keep = info.filter((z) => z.live.length > 0 && z.seq.length);
    if (!keep.length) return { error: info.some((z) => z.seq.length) ? 'noLiveNow' : 'routeUnavailable' };
    const merged = mergeLiveChoices(keep);
    const payloadKeep = merged.map((z) => ({
      service: z.x,
      live: z.live,
      companies: z.companies,
      shortDests: z.shortDests || [],
      note: (z.shortDests || []).length ? t('shortWorking', z.shortDests.join(lang === 'zh' ? '、' : ', ')) : '',
      hasVariants: false
    }));
    return {
      keep: payloadKeep,
      auto: payloadKeep.length === 1 ? payloadKeep[0].service : null
    };
  }

  const pickArrival = useCallback(async (s) => {
    setArrivalService(s);
    setArrivalChoices(null);
    setArrivalStopIndex('');
    setArrivalDestIndex('');
    setArrivalTimes(null);
    setFetchedStops({});
    setOpenStopKey(null);
    setArrivalGroups(groups(await fetchStops(s)));
  }, [api, lang, routes]); // groups depends on lang

  const showArrival = useCallback(async (service, groupsList, index, destIndex) => {
    if (index === '' || !service) return;
    const g = groupsList[+index];
    if (!g) return;
    setOpenStopKey(null);
    setFetchedStops({});
    const destVal = destIndex === undefined ? arrivalDestIndex : destIndex;
    const destGroup = destVal !== '' && +destVal > +index ? groupsList[+destVal] : null;
    try {
      const json = await api('/api/ride', {
        method: 'POST',
        body: JSON.stringify({
          first: service,
          boardStops: stopIds(g),
          destStops: destGroup ? stopIds(destGroup) : []
        })
      });
      setArrivalTimes({ trips: json.trips || [], destLabel: destGroup?.label || null, emptyReason: json.emptyReason });
    } catch {
      setArrivalTimes({ trips: [], destLabel: destGroup?.label || null, emptyReason: 'empty' });
    }
    lastView.current = 'a';
  }, [api, arrivalDestIndex]);

  const pickFirst = useCallback(async (s, restore = {}) => {
    setFirstService(s);
    setFirstChoices(null);
    setFirstBoxHidden(restore.keepBoxHidden !== false);
    setFirstGroups(groups(await fetchStops(s)));
    if (restore.board != null) setBoardIndex(restore.board);
    if (restore.inter != null) setInterchangeIndex(restore.inter);
  }, [api, lang]);

  function searchDest(q) {
    const query = q.trim().toLowerCase();
    const g = groups(stops.filter((x) => query.length > 1 && (
      (x.name_en || '').toLowerCase().includes(query) || (x.name_tc || '').includes(query)
    ))).slice(0, 40);
    setDestinationResults(g);
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

  function renderTransferItem(x, i, opts = {}) {
    const dest = loc(x.dest);
    const watching = opts.watching;
    const badge = watching ? t('watchingConnection') : (x.recommended ? t('recommended') : (x.kind === 'transfer' || x.kind === 'stay') && transferPhase === 'connections' && i > 0 ? t('backup') : kindLabel(x.kind));
    const body = (
      <>
        <span className="badge">{badge}</span> {serviceCo(x) !== 'KMB' ? <span className="badge">{coLabel(x)}</span> : null} <b>{x.route}</b>
        {dest ? <div>{t('towards')}{lang === 'zh' ? '' : ' '}{dest}</div> : null}
        <div>{loc(x.from)} → {loc(x.to)}</div>
        <div className="eta">
          <b>{clk(x.eta)}</b>
          <span className="mins">{t('minutes', mins(x.eta))}</span>
        </div>
        {x.kind === 'transfer' && x.waitAfterFirstMinutes != null ? (
          <div className="muted">{t('waitAfter', x.waitAfterFirstMinutes)}</div>
        ) : null}
        {fareNote(x)}
        {x.discount ? (
          <div className="muted"><span className="badge">{t('octopusDiscount')}</span> {lang === 'zh' ? x.discount.notes_zh : x.discount.notes_en} {t('discountNote')}</div>
        ) : null}
        {opts.pickHint ? <div className="muted">{t('pickConnection')}</div> : null}
      </>
    );
    if (opts.onPick) {
      return (
        <button className="item choice" type="button" key={`${x.kind}-${x.route}-${x.eta}-${i}`} onClick={opts.onPick}>
          {body}
        </button>
      );
    }
    return (
      <div className="item" key={`${x.kind}-${x.route}-${x.eta}-${i}`}>
        {body}
      </div>
    );
  }

  const goTransfer = useCallback(async (opts = {}) => {
    const f = opts.firstService ?? firstService;
    const d = opts.destination ?? destination;
    const fg = opts.firstGroups ?? firstGroups;
    const interVal = opts.interchangeIndex ?? interchangeIndex;
    const boardVal = opts.boardIndex ?? boardIndex;
    if (!f || !d || interVal === '') {
      setTransferResult(null);
      setTransferMessage(t('needFields'));
      return;
    }
    if ((opts.boardIndex ?? boardIndex) === '') {
      setTransferResult(null);
      setTransferMessage(t('needBoard'));
      return;
    }
    const phase = opts.phase
      ?? (transferPhase === 'connections' && selectedDeparture ? 'connections' : 'departures');
    const picked = Object.prototype.hasOwnProperty.call(opts, 'selectedDeparture')
      ? opts.selectedDeparture
      : (phase === 'connections' ? selectedDeparture : null);
    const watched = Object.prototype.hasOwnProperty.call(opts, 'selectedConnection')
      ? opts.selectedConnection
      : (phase === 'connections' ? selectedConnection : null);
    const seq = ++transferSeq.current;
    const silent = !!opts.silent && !!transferResult;
    if (!silent) {
      setTransferMessage(phase === 'departures' ? t('searchingDepartures') : t('searching'));
      setChosenDirect(null);
      setTransferResult(null);
    }
    try {
      const inter = fg[+interVal];
      const json = await api('/api/transfer', {
        method: 'POST',
        body: JSON.stringify({
          phase,
          selectedDeparture: picked || undefined,
          selectedConnection: watched || undefined,
          nearby: opts.nearby ?? nearby,
          radius: +(opts.radius ?? radius),
          first: f,
          boardStops: boardVal === '' ? [] : stopIds(fg[+boardVal]),
          interchangeStops: stopIds(inter),
          destinationStops: stopIds(d)
        })
      });
      if (seq !== transferSeq.current) return;
      setTransferMessage('');
      setTransferPhase(json.phase || phase);
      if (phase === 'departures') {
        setSelectedDeparture(null);
        setSelectedConnection(null);
      } else if (picked) setSelectedDeparture(picked);
      if (Object.prototype.hasOwnProperty.call(opts, 'selectedConnection')) {
        setSelectedConnection(opts.selectedConnection);
      }
      setTransferResult({ json, inter });
      lastView.current = 't';
    } catch (e) {
      if (seq !== transferSeq.current) return;
      if (!silent) {
        setTransferResult(null);
        setTransferMessage(e.message || t('none'));
      }
    }
  }, [api, firstService, destination, firstGroups, interchangeIndex, boardIndex, nearby, radius, t, transferPhase, selectedDeparture, selectedConnection, transferResult]);

  const lineName = (line) => loc(line.name) || line.name;
  const stationLabel = (row) => (lang === 'zh' ? row[1] : row[2]);
  function rideDestStations(line, origin) {
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

  const lineEntries = Object.entries(lines);
  const currentLine = lines[mtrLine] || lineEntries[0]?.[1];
  const currentLineKey = lines[mtrLine] ? mtrLine : (lineEntries[0]?.[0] || '');
  const currentStations = currentLine?.stations || [];
  const currentSta = currentStations.some((row) => row[0] === mtrStation)
    ? mtrStation
    : (currentStations[0]?.[0] || '');

  const showMtr = useCallback(async (line = currentLineKey, sta = currentSta, dest = mtrDest) => {
    if (!line || !sta) return;
    const destCode = dest && dest !== sta ? dest : '';
    try {
      const r = await api(`/api/mtr/schedule?line=${encodeURIComponent(line)}&sta=${encodeURIComponent(sta)}${destCode ? `&dest=${encodeURIComponent(destCode)}` : ''}`);
      setMtrResult(r);
      lastView.current = 'm';
    } catch {
      setMtrResult({ trains: [], emptyReason: 'unavailable' });
    }
  }, [api, currentLineKey, currentSta, mtrDest]);

  function groupStopEtas(rows) {
    const m = new Map();
    for (const x of rows || []) {
      if (!x.eta) continue;
      const destZh = x.dest_tc || x.dest_en || '';
      const destEn = x.dest_en || x.dest_tc || '';
      const k = [n(x.route), destZh].join('|');
      if (!m.has(k)) m.set(k, { route: x.route, dest: { zh: destZh, en: destEn }, times: [] });
      m.get(k).times.push(x.eta);
    }
    return [...m.values()].map((g) => ({ ...g, times: cluster(g.times) }));
  }

  async function findNearbyStops() {
    setNearbyBoard(null);
    if (!navigator.geolocation) {
      setNearbyList({ error: 'geoDenied' });
      return;
    }
    setNearbyList({ loading: true });
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const json = await api(`/api/stops/nearby?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&radius=250`);
        setNearbyList({ data: json.data || [] });
      } catch (error) {
        setNearbyList({ error: error.message || 'geoDenied' });
      }
    }, () => setNearbyList({ error: 'geoDenied' }), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }

  function coLabel(service, companies) {
    const set = new Set((companies && companies.length ? companies : [serviceCo(service)]).map(String));
    const hasCtb = set.has('CTB');
    const hasGmb = set.has('GMB');
    const hasFranchised = [...set].some((c) => c !== 'CTB' && c !== 'GMB');
    if (hasCtb && hasFranchised) return t('coJoint');
    if (hasGmb) return t('coGmb');
    if (hasCtb) return t('coCtb');
    if (set.has('LWB')) return t('coLwb');
    return t('coKmb');
  }

  async function pickNearbyStop(stop) {
    setNearbyList((prev) => ({ ...(prev || {}), picked: stop }));
    try {
      const json = stop.co === 'CTB'
        ? await api(`/api/citybus/stop-eta/${encodeURIComponent(stop.stop)}`)
        : await api(`/api/kmb/stop-eta/${encodeURIComponent(stop.stop)}`);
      setNearbyBoard({ stop, groups: groupStopEtas(json.data || []) });
    } catch {
      setNearbyBoard({ stop, groups: [] });
    }
  }

  const renderHome = useCallback(async () => {
    try {
      const json = await api('/api/homes');
      const rows = json.data || [];
      setHomes(rows);
      setHomeError('');
      if (!homeOpened.current && rows.length) {
        homeOpened.current = true;
        setTab('home');
      }
    } catch (error) {
      setHomeError(error.message);
    }
  }, [api]);

  async function saveHome(item) {
    await api('/api/homes', { method: 'POST', body: JSON.stringify(item) });
    setTab('home');
    renderHome();
  }

  function typeLabel(type) {
    if (type === 'arrival') return t('typeArrival');
    if (type === 'transfer') return t('typeTransfer');
    if (type === 'mtr') return t('typeMtr');
    return type;
  }

  async function openHome(item) {
    if (!item) return;
    if (item.type === 'arrival') {
      setTab('arrivals');
      const s = item.payload.service;
      setArrivalService(s);
      setArrivalChoices(null);
      const g = groups(await fetchStops(s));
      setArrivalGroups(g);
      const idx = String(item.payload.stopIndex);
      setArrivalStopIndex(idx);
      const destIdx = item.payload.destIndex != null && item.payload.destIndex !== '' ? String(item.payload.destIndex) : '';
      setArrivalDestIndex(destIdx);
      await showArrival(s, g, idx, destIdx);
    } else if (item.type === 'transfer') {
      setTab('transfer');
      setNearby(item.payload.nearby !== false);
      setRadius(String(item.payload.radius || '250'));
      const s = item.payload.first;
      const g = groups(await fetchStops(s));
      setFirstService(s);
      setFirstChoices(null);
      setFirstBoxHidden(true);
      setFirstGroups(g);
      const bIdx = item.payload.boardIndex ?? '';
      const iIdx = item.payload.interchangeIndex;
      setBoardIndex(bIdx);
      setInterchangeIndex(iIdx);
      const dest = {
        label: item.payload.destLabel,
        stops: (item.payload.destStops || []).map((id) => stopMap.get(id)).filter(Boolean)
      };
      setDestination(dest);
      setDestBoxHidden(true);
      setChosenDirect(null);
      setSelectedDeparture(null);
      setTransferPhase(null);
      await goTransfer({
        firstService: s,
        firstGroups: g,
        destination: dest,
        boardIndex: bIdx,
        interchangeIndex: iIdx,
        nearby: item.payload.nearby !== false,
        radius: item.payload.radius || '250',
        phase: 'departures',
        selectedDeparture: null
      });
    } else if (item.type === 'mtr') {
      setTab('mtr');
      setMtrLine(item.payload.line);
      setMtrStation(item.payload.station);
      setMtrDest(item.payload.dest || '');
      await showMtr(item.payload.line, item.payload.station, item.payload.dest || '');
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem('tb-lang');
    if (stored === 'en' || stored === 'zh') setLang(stored);
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    if (typeof window !== 'undefined' && !window.matchMedia('(display-mode: standalone)').matches) {
      setStandaloneHint(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
    document.title = t('title');
  }, [lang, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [routeJson, stopJson, lineJson] = await Promise.all([
          api('/api/kmb/routes'),
          api('/api/kmb/stops'),
          api('/api/mtr/lines')
        ]);
        if (cancelled) return;
        const nextRoutes = routeJson.data || [];
        setRoutes(nextRoutes);
        setStops(stopJson.data || []);
        setLines(lineJson.data || {});
        setDirCount(nextRoutes.length ? nextRoutes.length : -1);
        setTimeout(async () => {
          if (cancelled) return;
          try {
            const later = await api('/api/kmb/stops');
            const nextStops = later.data || [];
            if (nextStops.length > (stopJson.data || []).length) setStops(nextStops);
          } catch {}
        }, 12000);
      } catch (error) {
        if (!cancelled) {
          setDirCount(-1);
          setOffline(true);
        }
      }
      if (!cancelled) renderHome();
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const entries = Object.entries(lines);
    if (!entries.length) return;
    if (!mtrLine) setMtrLine(entries[0][0]);
  }, [lines, mtrLine]);

  useEffect(() => {
    const id = setInterval(() => {
      if (lastView.current === 'a' && arrivalService && arrivalStopIndex !== '') {
        showArrival(arrivalService, arrivalGroups, arrivalStopIndex);
      }
      if (lastView.current === 't' && !chosenDirect) goTransfer({ silent: true });
      if (lastView.current === 'm') showMtr();
    }, +refreshSec * 1000);
    return () => clearInterval(id);
  }, [refreshSec, arrivalService, arrivalGroups, arrivalStopIndex, arrivalDestIndex, showArrival, goTransfer, showMtr, chosenDirect, mtrDest]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (arrivalRoute.trim()) {
        (async () => {
          setArrivalChoices({ loading: true });
          const payload = await loadChoices(arrivalRoute);
          setArrivalChoices(payload);
          if (payload.auto) pickArrival(payload.auto);
        })();
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [arrivalRoute]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (firstRoute.trim()) {
        (async () => {
          setFirstChoices({ loading: true });
          const payload = await loadChoices(firstRoute);
          setFirstChoices(payload);
          if (payload.auto) pickFirst(payload.auto);
        })();
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [firstRoute]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (destinationInput.trim().length > 1) searchDest(destinationInput);
    }, 500);
    return () => clearTimeout(handle);
  }, [destinationInput, stops, lang]);

  useEffect(() => {
    if (tab === 'home') renderHome();
  }, [tab, renderHome]);

  function resolvedStops(id, stops) {
    if (Array.isArray(stops) && stops.length) return stops;
    const extra = fetchedStops[id];
    return Array.isArray(extra) ? extra : extra === 'loading' ? extra : [];
  }

  function renderStopTimes(id, stops, fetchStops) {
    const list = resolvedStops(id, stops);
    const loading = fetchedStops[id] === 'loading';
    const canOpen = (Array.isArray(list) && list.length > 1) || loading || fetchStops;
    if (!canOpen) return null;
    const open = openStopKey === id;
    return (
      <>
        <button
          className="tab mt-2"
          type="button"
          onClick={async () => {
            if (open) {
              setOpenStopKey(null);
              return;
            }
            setOpenStopKey(id);
            if ((!Array.isArray(list) || list.length < 2) && fetchStops) await fetchStops();
          }}
        >
          {open ? t('hideStopTimes') : t('showStopTimes')}
        </button>
        {open && loading ? <p className="muted mt-2">{t('stopTimesLoading')}</p> : null}
        {open && Array.isArray(list) && list.length > 1 ? (
          <ol className="stop-times">
            {list.map((stop, i) => (
              <li key={`${stop.stop || stop.name?.zh || i}-${stop.time || i}`}>
                <span>{loc(stop.name)}</span>
                <span>{clk(stop.time)}{stop.estimated ? ` · ${t('stopTimeEst')}` : ''}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {open && !loading && Array.isArray(list) && list.length <= 1 ? <p className="muted mt-2">{t('stopTimesEmpty')}</p> : null}
      </>
    );
  }

  const loadArrivalStops = useCallback(async (trip) => {
    const key = `arrival-${trip.board}`;
    if (Array.isArray(trip.stops) && trip.stops.length > 1) return trip.stops;
    if (Array.isArray(fetchedStops[key]) || fetchedStops[key] === 'loading') return fetchedStops[key];
    const g = arrivalGroups[+arrivalStopIndex];
    if (!arrivalService || !g) return [];
    setFetchedStops((prev) => ({ ...prev, [key]: 'loading' }));
    try {
      const json = await api('/api/ride', {
        method: 'POST',
        body: JSON.stringify({
          first: arrivalService,
          boardStops: stopIds(g),
          destStops: []
        })
      });
      const hit = (json.trips || []).find((row) => Math.abs(new Date(row.board) - new Date(trip.board)) <= 90 * 1000)
        || (json.trips || [])[0];
      const stops = hit?.stops || [];
      setFetchedStops((prev) => ({ ...prev, [key]: stops }));
      return stops;
    } catch {
      setFetchedStops((prev) => ({ ...prev, [key]: [] }));
      return [];
    }
  }, [api, arrivalGroups, arrivalService, arrivalStopIndex, fetchedStops]);

  const loadMtrStops = useCallback(async (train) => {
    const key = `mtr-${train.line || mtrLine}-${train.time}`;
    if (Array.isArray(train.stops) && train.stops.length > 1) return train.stops;
    if (Array.isArray(fetchedStops[key]) || fetchedStops[key] === 'loading') return fetchedStops[key];
    const destCode = train.destCode;
    if (!destCode) return [];
    setFetchedStops((prev) => ({ ...prev, [key]: 'loading' }));
    try {
      const json = await api(`/api/mtr/schedule?line=${encodeURIComponent(train.line || mtrLine)}&sta=${encodeURIComponent(mtrStation)}&dest=${encodeURIComponent(destCode)}`);
      const hit = (json.trains || []).find((row) => row.destCode === destCode && Math.abs(new Date(row.time) - new Date(train.time)) <= 90 * 1000)
        || (json.trains || []).find((row) => row.destCode === destCode)
        || (json.trains || [])[0];
      const stops = hit?.stops || [];
      setFetchedStops((prev) => ({ ...prev, [key]: stops }));
      return stops;
    } catch {
      setFetchedStops((prev) => ({ ...prev, [key]: [] }));
      return [];
    }
  }, [api, fetchedStops, mtrLine, mtrStation]);

  const etaList = (input, opts = {}) => {
    const isRide = input && !Array.isArray(input);
    const trips = isRide
      ? (input.trips || [])
      : (input || []).map((time) => ({ board: time }));
    const destLabel = isRide ? input.destLabel : null;
    if (isRide && input.emptyReason === 'no_dest') return <p className="muted">{t('noRideDest')}</p>;
    if (!trips.length) return <p className="muted">{t(isRide ? 'noLiveNow' : 'noEta')}</p>;
    const rows = trips.map((x, i) => {
      const board = x.board || x;
      const wait = destLabel && x.arrive ? mins(x.arrive) : mins(board);
      if (wait == null) return null;
      const service = x.route
        ? <><span className="badge">{coLabel(x)}</span> <b>{x.route}</b>{loc(x.dest) ? <div>{t('towards')}{lang === 'zh' ? '' : ' '}{loc(x.dest)}</div> : null}</>
        : <b>{clk(board)}</b>;
      const stopId = `arrival-${board}`;
      return (
        <div className="item" key={`${x.route || ''}-${board}-${i}`}>
          <div className="eta">
            <div>
              {destLabel && i === 0 ? <span className="badge">{t('earliestArrival')}</span> : null}{service}
              {destLabel ? <div className="muted">{clk(board)} {t('rideDeparts')}</div> : null}
              {destLabel && x.arrive ? (
                <div className="muted">{clk(x.arrive)} {t('rideArrives')}{lang === 'zh' ? '' : ' '}{destLabel}{x.rideMinutes != null ? ` · ${t('rideMins', x.rideMinutes)}` : ''}</div>
              ) : null}
              {destLabel && x.arrivalEstimated ? <div className="muted">{t('rideArriveGuessed')}</div> : null}
            </div>
            <span className="mins">{t('minutes', wait)}</span>
          </div>
          {renderStopTimes(stopId, x.stops, opts.fetchStops ? () => loadArrivalStops(x) : null)}
        </div>
      );
    }).filter(Boolean);
    return rows.length ? rows : <p className="muted">{t(isRide ? 'noLiveNow' : 'noEta')}</p>;
  };

  function fareNote(x, opts = {}) {
    if (!x || (x.full_fare_hkd == null && x.journey_time_minutes == null && x.section_fare_hkd == null && !(x.section_prices || []).length)) return null;
    const parts = [];
    if (x.section_fare_hkd != null) parts.push(t('sectionFare', x.section_fare_hkd));
    else if (x.full_fare_hkd != null) parts.push(t('fullFare', x.full_fare_hkd));
    if (x.section_fare_hkd != null && x.full_fare_hkd != null && Number(x.section_fare_hkd) !== Number(x.full_fare_hkd)) {
      parts.push(t('fullFare', x.full_fare_hkd));
    }
    if (x.section_fare_hkd == null && (x.section_prices || []).length > 1) {
      parts.push(t('sectionList', x.section_prices.map((n) => `$${Number(n).toFixed(1)}`).join(' / ')));
    }
    if (x.journey_time_minutes != null && !opts.hideScheduled && !(x.rideMinutes > 0)) parts.push(t('scheduledMins', x.journey_time_minutes));
    if (!parts.length) return null;
    return <div className="muted">{parts.join(' · ')}</div>;
  }

  function renderChoiceList(payload, onPick) {
    if (!payload) return null;
    if (payload.loading) return <div className="note">{t('checking')}</div>;
    if (payload.error) return <p className="muted">{t(payload.error)}</p>;
    return (
      <>
        {payload.keep.map((z, i) => (
          <button key={`${z.service.co || 'KMB'}-${z.service.route}-${z.service.bound}-${z.service.service_type}-${z.service.gmb_route_id || ''}-${i}`} className="item choice" type="button" onClick={() => onPick(z.service)}>
            <span className="badge">{coLabel(z.service, z.companies)}</span> <b>{z.service.route}</b>
            <div>{rn(z.service)}</div>
            {fareNote(z.service)}
            {z.note ? <div className="muted">{z.note}</div> : null}
          </button>
        ))}
      </>
    );
  }

  const tabs = [
    ['arrivals', t('tabArrivals')],
    ['transfer', t('tabTransfer')],
    ['mtr', t('tabMtr')],
    ['home', t('tabHome')]
  ];

  const transferEmpty = transferResult?.json?.emptyReason && !(transferResult.json.list || []).length && !(transferResult.json.departures || []).length && !(transferResult.json.directs || []).length
    ? t(emptyReasonKey(transferResult.json.emptyReason))
    : '';
  const findLabel = t('transferFind');
  const resultPhase = chosenDirect ? 'direct' : (transferResult?.json?.phase || transferPhase);

  return (
    <main className="shell">
      <header className="app-header mb-4">
        <div>
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <p className="muted app-tagline">{t('subtitle')}</p>
        </div>
        <div className="app-controls">
          <button
            className="tab"
            type="button"
            aria-label={t('langBtn')}
            onClick={() => {
              const next = lang === 'zh' ? 'en' : 'zh';
              setLang(next);
              localStorage.setItem('tb-lang', next);
            }}
          >
            {t('langBtn')}
          </button>
          <select className="field" value={refreshSec} onChange={(e) => setRefreshSec(e.target.value)}>
            <option value="15">{t('refresh15')}</option>
            <option value="30">{t('refresh30')}</option>
          </select>
        </div>
      </header>
      <div className="note">{dirCount == null ? t('loading') : dirCount < 0 ? (offline ? t('connectionRefused') : t('loadFail')) : t('ready', dirCount)}</div>
      {standaloneHint ? <p className="muted">{t('addHomeScreen')}</p> : null}
      <nav className="tabs my-5">
        {tabs.map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? ' active' : ''}`} type="button" onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      <section className={`panel${tab === 'arrivals' ? ' active' : ''}`}>
        <div className="card">
          <h2 className="text-lg font-bold">{t('arrivalsHeading')}</h2>
          <div className="search-row mt-3">
            <input className="field" placeholder={t('routePlaceholder')} value={arrivalRoute} onChange={(e) => setArrivalRoute(e.target.value)} aria-label={t('routePlaceholder')} />
              <button className="btn" type="button" aria-label={t('find')} onClick={async () => {
                setArrivalChoices({ loading: true });
                const payload = await loadChoices(arrivalRoute);
                setArrivalChoices(payload);
                if (payload.auto) pickArrival(payload.auto);
              }}>{t('find')}</button>
          </div>
          <button className="tab btn-block mt-3" type="button" aria-label={t('nearbyStops')} onClick={findNearbyStops}>{t('nearbyStops')}</button>
          {nearbyList?.loading ? <div className="note">{t('locating')}</div> : null}
          {nearbyList?.error ? <p className="muted">{nearbyList.error === 'geoDenied' ? t('geoDenied') : nearbyList.error}</p> : null}
          {nearbyList?.data?.length ? (
            <div className="mt-2">
              {nearbyList.data.map((stop) => (
                <button key={stop.stop} className="item choice" type="button" onClick={() => pickNearbyStop(stop)}>
                  <b>{lang === 'zh' ? stop.name_tc || stop.name_en : stop.name_en || stop.name_tc}</b>
                  <div className="muted">{coLabel(stop)} · {t('metres', stop.metres)}</div>
                </button>
              ))}
            </div>
          ) : nearbyList?.data && !nearbyList.data.length ? <p className="muted">{t('noStops')}</p> : null}
          {nearbyBoard ? (
            <>
              <h3 className="font-bold mt-3">{lang === 'zh' ? nearbyBoard.stop.name_tc || nearbyBoard.stop.name_en : nearbyBoard.stop.name_en || nearbyBoard.stop.name_tc}</h3>
              {nearbyBoard.groups.length
                ? nearbyBoard.groups.map((g) => (
                  <div className="item" key={g.route + loc(g.dest)}>
                    <b>{g.route}</b>
                    <div>{t('towards')}{lang === 'zh' ? '' : ' '}{loc(g.dest)}</div>
                    {etaList(g.times)}
                  </div>
                ))
                : <p className="muted">{t('noLiveNow')}</p>}
            </>
          ) : null}
          <div>{renderChoiceList(arrivalChoices, pickArrival)}</div>
          {arrivalService ? (
            <>
              <select className="field mt-3" value={arrivalStopIndex} onChange={async (e) => {
                const v = e.target.value;
                setArrivalStopIndex(v);
                let dest = arrivalDestIndex;
                if (dest !== '' && (v === '' || +dest <= +v)) {
                  dest = '';
                  setArrivalDestIndex('');
                }
                await showArrival(arrivalService, arrivalGroups, v, dest);
              }}>
                <option value="">{t('chooseStop')}</option>
                {arrivalGroups.map((g, i) => <option key={g.label + i} value={i}>{g.label}</option>)}
              </select>
              {arrivalStopIndex !== '' ? (
                <label className="block mt-3">
                  <span>{t('rideDestLabel')}</span>
                  <select className="field mt-1" value={arrivalDestIndex} onChange={async (e) => {
                    const v = e.target.value;
                    setArrivalDestIndex(v);
                    await showArrival(arrivalService, arrivalGroups, arrivalStopIndex, v);
                  }}>
                    <option value="">{t('chooseRideDest')}</option>
                    {arrivalGroups.map((g, i) => (
                      i > +arrivalStopIndex ? <option key={`d-${g.label}-${i}`} value={i}>{g.label}</option> : null
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
          {arrivalTimes && arrivalStopIndex !== '' ? (
            <>
              <h3 className="font-bold mt-3">{arrivalGroups[+arrivalStopIndex]?.label}{arrivalTimes.destLabel ? ` → ${arrivalTimes.destLabel}` : ''}</h3>
              {fareNote(arrivalService, { hideScheduled: !!(arrivalTimes?.destLabel && arrivalTimes?.trips?.some((row) => row.rideMinutes > 0)) })}
              {etaList(arrivalTimes, { fetchStops: true })}
              <div className="row-actions">
                <button className="tab" type="button" onClick={() => {
                  const g = arrivalGroups[+arrivalStopIndex];
                  const destG = arrivalDestIndex !== '' ? arrivalGroups[+arrivalDestIndex] : null;
                  saveHome({
                    type: 'arrival',
                    title: { zh: `${arrivalService.route}（${areaName(g.stops[0])}）`, en: `${arrivalService.route} at ${g.stops[0].name_en || g.stops[0].name_tc}` },
                    subtitle: destG
                      ? { zh: `${g.label} → ${destG.label}`, en: `${g.label} → ${destG.label}` }
                      : { zh: `${arrivalService.orig_tc || arrivalService.orig_en} → ${arrivalService.dest_tc || arrivalService.dest_en}`, en: `${arrivalService.orig_en || arrivalService.orig_tc} → ${arrivalService.dest_en || arrivalService.dest_tc}` },
                    payload: { service: arrivalService, stopIndex: +arrivalStopIndex, destIndex: arrivalDestIndex === '' ? '' : +arrivalDestIndex }
                  });
                }}>{t('saveHome')}</button>
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section className={`panel${tab === 'transfer' ? ' active' : ''}`}>
        <div className="card">
          <h2 className="text-lg font-bold">{t('transferHeading')}</h2>
          <label className="block mt-3">
            <input type="checkbox" checked={nearby} onChange={(e) => setNearby(e.target.checked)} /> <span>{t('nearbyLabel')}</span>
          </label>
          <label className="block mt-2">
            <span>{t('radiusLabel')}</span>
            <select className="field mt-1" value={radius} onChange={(e) => setRadius(e.target.value)}>
              <option value="150">{t('m150')}</option>
              <option value="250">{t('m250')}</option>
              <option value="400">{t('m400')}</option>
            </select>
          </label>
          <div className={`mt-4${firstBoxHidden ? ' hidden' : ''}`}>
            <b>{t('firstRouteLabel')}</b>
            <div className="search-row mt-1">
              <input className="field" placeholder={t('routePlaceholder')} value={firstRoute} onChange={(e) => setFirstRoute(e.target.value)} aria-label={t('firstRouteLabel')} />
              <button className="btn" type="button" aria-label={t('find')} onClick={async () => {
                setFirstChoices({ loading: true });
                const payload = await loadChoices(firstRoute);
                setFirstChoices(payload);
                if (payload.auto) pickFirst(payload.auto);
              }}>{t('find')}</button>
            </div>
            <div>{renderChoiceList(firstChoices, (s) => pickFirst(s))}</div>
          </div>
          {firstService ? (
            <div className="note">
              <b>{firstService.route}</b>
              <div>{rn(firstService)}</div>
              {fareNote(firstService)}
              <button className="tab mt-2" type="button" onClick={() => setFirstBoxHidden(false)}>{t('change')}</button>
            </div>
          ) : null}
          {firstService ? (
            <div className="md-grid-2 mt-4">
              <label>{t('boardStop')}
                <select className="field mt-1" value={boardIndex} onChange={(e) => setBoardIndex(e.target.value)}>
                  <option value="">{t('notSelected')}</option>
                  {firstGroups.map((g, i) => <option key={`b-${g.label}-${i}`} value={i}>{g.label}</option>)}
                </select>
              </label>
              <label>{t('interchangeStop')}
                <select className="field mt-1" value={interchangeIndex} onChange={(e) => setInterchangeIndex(e.target.value)}>
                  <option value="">{t('chooseInterchange')}</option>
                  {firstGroups.map((g, i) => <option key={`i-${g.label}-${i}`} value={i}>{g.label}</option>)}
                </select>
              </label>
            </div>
          ) : null}
          <div className={`mt-4${destBoxHidden ? ' hidden' : ''}`}>
            <b>{t('destLabel')}</b>
            <div className="search-row mt-1">
              <input className="field" placeholder={t('destPlaceholder')} value={destinationInput} onChange={(e) => setDestinationInput(e.target.value)} />
              <button className="btn" type="button" aria-label={t('find')} onClick={() => searchDest(destinationInput)}>{t('find')}</button>
            </div>
            <div>
              {destinationResults
                ? (destinationResults.length
                  ? destinationResults.map((x, i) => (
                    <button key={x.label + i} className="item choice" type="button" onClick={() => {
                      setDestination(x);
                      setDestBoxHidden(true);
                    }}>{x.label}</button>
                  ))
                  : <p className="muted">{t('noStops')}</p>)
                : null}
            </div>
          </div>
          {destination ? (
            <div className="note">
              <b>{t('destArea')}</b>
              <div>{destination.label}</div>
              <button className="tab mt-2" type="button" onClick={() => setDestBoxHidden(false)}>{t('change')}</button>
            </div>
          ) : null}
          <button
            className="btn btn-block mt-4"
            type="button"
            aria-label={findLabel}
            onClick={() => {
              setChosenDirect(null);
              setSelectedDeparture(null);
              setSelectedConnection(null);
              setTransferPhase(null);
              goTransfer({ phase: 'departures', selectedDeparture: null });
            }}
          >{findLabel}</button>
          <div>
            {transferMessage ? <div className="note">{transferMessage}</div> : null}
            {chosenDirect ? (
              <>
                <div className="note">{t('chosenDirect')}</div>
                {renderTransferItem(chosenDirect, 0)}
                <button className="tab mt-2" type="button" onClick={() => {
                  setChosenDirect(null);
                  goTransfer({ phase: 'departures', selectedDeparture: null });
                }}>{t('changeDeparture')}</button>
                <div className="row-actions">
                  <button className="tab" type="button" onClick={() => saveHome({
                    type: 'transfer',
                    title: { zh: `${firstService.route} → ${destination.label}`, en: `${firstService.route} → ${destination.label}` },
                    subtitle: { zh: `${transferResult?.inter?.label || ''} 轉車`, en: `Transfer at ${transferResult?.inter?.label || ''}` },
                    payload: {
                      first: firstService,
                      boardIndex,
                      interchangeIndex,
                      destLabel: destination.label,
                      destStops: stopIds(destination),
                      nearby,
                      radius
                    }
                  })}>{t('saveHome')}</button>
                </div>
              </>
            ) : null}
            {!chosenDirect && transferResult ? (
              <>
                {resultPhase === 'departures' ? (
                  <>
                    <h3 className="font-bold mt-4">{t('firstDepartures')}</h3>
                    {(transferResult.json.departures || []).length
                      ? transferResult.json.departures.map((row, i) => {
                        const dest = loc(row.dest);
                        return (
                          <button
                            key={`${row.eta}-${i}`}
                            className="item choice"
                            type="button"
                            onClick={() => goTransfer({ phase: 'connections', selectedDeparture: row.eta })}
                          >
                            <b>{firstService.route}</b>
                            {dest ? <div>{t('towards')}{lang === 'zh' ? '' : ' '}{dest}</div> : null}
                            {fareNote(transferResult.json.firstFare || firstService)}
                            <div className="eta">
                              <b>{clk(row.eta)}</b>
                              <span className="mins">{t('minutes', mins(row.eta))}</span>
                            </div>
                            <div className="muted">{t('pickDeparture')}</div>
                          </button>
                        );
                      })
                      : <p className="muted">{t(emptyReasonKey(transferResult.json.emptyReason || 'no_departure'))}</p>}
                    <h3 className="font-bold mt-4">{t('directHeading')}</h3>
                    {(transferResult.json.directs || []).length
                      ? transferResult.json.directs.map((x, i) => (
                        <button
                          key={`d-${x.route}-${x.eta}-${i}`}
                          className="item choice"
                          type="button"
                          onClick={() => {
                            setChosenDirect(x);
                            setTransferPhase('direct');
                            lastView.current = 't';
                          }}
                        >
                          <span className="badge">{kindLabel(x.kind)}</span> <b>{x.route}</b>
                          {loc(x.dest) ? <div>{t('towards')}{lang === 'zh' ? '' : ' '}{loc(x.dest)}</div> : null}
                          <div>{loc(x.from)} → {loc(x.to)}</div>
                          {fareNote(x)}
                          <div className="eta">
                            <b>{clk(x.eta)}</b>
                            <span className="mins">{t('minutes', mins(x.eta))}</span>
                          </div>
                        </button>
                      ))
                      : <p className="muted">{t('noDirect')}</p>}
                  </>
                ) : (
                  <>
                    {transferResult.json.firstArrivalAtInterchange ? (
                      <div className="note">
                        <h3 className="font-bold">{t('firstArrival')}</h3>
                        <div className="eta mt-2">
                          <b>{clk(transferResult.json.firstArrivalAtInterchange)}</b>
                          <span className="mins">{mins(transferResult.json.firstArrivalAtInterchange) == null ? '' : t('minutes', mins(transferResult.json.firstArrivalAtInterchange))}</span>
                        </div>
                        {fareNote(transferResult.json.firstFare || firstService)}
                        {transferResult.json.boardDeparture ? (
                          <div className="muted mt-2">{t('boardAt')}：{clk(transferResult.json.boardDeparture)}</div>
                        ) : null}
                        {transferResult.json.arrivalEstimated ? (
                          <div className="muted mt-2">{t('firstArrivalGuessed')}</div>
                        ) : null}
                        {renderStopTimes('transfer-first', transferResult.json.firstStops)}
                      </div>
                    ) : null}
                    <button className="tab mt-2" type="button" onClick={() => {
                        setSelectedDeparture(null);
                        setSelectedConnection(null);
                        goTransfer({ phase: 'departures', selectedDeparture: null, selectedConnection: null });
                      }}>{t('changeDeparture')}</button>
                    {transferResult.json.watch?.selected || selectedConnection ? (
                      <div className="note mt-4">
                        <h3 className="font-bold">{t('watchingConnection')}</h3>
                        <p className="muted mt-2">{t('watchingLive')}</p>
                        {transferResult.json.watch?.selected ? renderTransferItem(transferResult.json.watch.selected, 0, { watching: true }) : null}
                        <p className={transferResult.json.watch?.catchable ? 'mt-2' : 'muted mt-2'}>
                          {transferResult.json.watch?.catchable ? t('stillCatchable') : t('missedConnection')}
                        </p>
                        {transferResult.json.watch?.earlier ? (
                          <>
                            <p className="mt-2">{t('earlierConnection')}</p>
                            {renderTransferItem(transferResult.json.watch.earlier, 1, {
                              onPick: () => goTransfer({
                                phase: 'connections',
                                selectedConnection: transferResult.json.watch.earlier,
                                silent: true
                              })
                            })}
                            <button className="tab mt-2" type="button" onClick={() => goTransfer({
                              phase: 'connections',
                              selectedConnection: transferResult.json.watch.earlier,
                              silent: true
                            })}>{t('switchToEarlier')}</button>
                          </>
                        ) : null}
                        <button className="tab mt-2" type="button" onClick={() => {
                          setSelectedConnection(null);
                          goTransfer({ phase: 'connections', selectedConnection: null, silent: true });
                        }}>{t('changeConnection')}</button>
                      </div>
                    ) : null}
                    <h3 className="font-bold mt-4">{t('combinedList')}</h3>
                    {(transferResult.json.list || []).length
                      ? transferResult.json.list.map((x, i) => renderTransferItem(x, i, {
                        watching: selectedConnection && String(selectedConnection.route).toUpperCase() === String(x.route).toUpperCase()
                          && (selectedConnection.co || 'KMB') === (x.co || 'KMB'),
                        pickHint: !selectedConnection,
                        onPick: () => goTransfer({ phase: 'connections', selectedConnection: x, silent: true })
                      }))
                      : <p className="muted">{transferEmpty || t('noConnection')}</p>}
                  </>
                )}
                <div className="row-actions">
                  <button className="tab" type="button" onClick={() => saveHome({
                    type: 'transfer',
                    title: { zh: `${firstService.route} → ${destination.label}`, en: `${firstService.route} → ${destination.label}` },
                    subtitle: { zh: `${transferResult.inter.label} 轉車`, en: `Transfer at ${transferResult.inter.label}` },
                    payload: {
                      first: firstService,
                      boardIndex,
                      interchangeIndex,
                      destLabel: destination.label,
                      destStops: stopIds(destination),
                      nearby,
                      radius
                    }
                  })}>{t('saveHome')}</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section className={`panel${tab === 'mtr' ? ' active' : ''}`}>
        <div className="card">
          <h2 className="text-lg font-bold">{t('mtrHeading')}</h2>
          <label className="block mt-3">
            <span>{t('mtrLineLabel')}</span>
            <select className="field mt-1" value={currentLineKey} onChange={(e) => {
              setMtrLine(e.target.value);
              setMtrStation('');
              setMtrDest('');
            }}>
              {lineEntries.map(([k, v]) => <option key={k} value={k}>{lineName(v)}</option>)}
            </select>
          </label>
          <label className="block mt-3">
            <span>{t('mtrStationLabel')}</span>
            <select className="field mt-1" value={currentSta} onChange={(e) => {
              const sta = e.target.value;
              setMtrStation(sta);
              if (mtrDest === sta) setMtrDest('');
            }}>
              {currentStations.map((row) => <option key={row[0]} value={row[0]}>{stationLabel(row)}</option>)}
            </select>
          </label>
          <label className="block mt-3">
            <span>{t('mtrDestLabel')}</span>
            <select className="field mt-1" value={mtrDest} onChange={(e) => setMtrDest(e.target.value)}>
              <option value="">{t('chooseRideDest')}</option>
              {rideDestStations(currentLine, currentSta).map((row) => (
                <option key={row[0]} value={row[0]}>{stationLabel(row)}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-block mt-4" type="button" aria-label={t('mtrFind')} onClick={() => showMtr()}>{t('mtrFind')}</button>
          <div>
            {mtrResult ? (
              <>
                {mtrResult.delayed ? <div className="note">{t('mtrDelayed')}</div> : null}
                {(mtrResult.trains || []).length
                  ? mtrResult.trains.map((x, i) => {
                    const wait = x.arrive ? (x.arriveMinutes ?? mins(x.arrive)) : (x.minutes != null ? x.minutes : mins(x.time));
                    const when = x.time ? clk(x.time) : '';
                    const plat = x.platform ? t('platform', x.platform) : '';
                    const destName = loc(mtrResult.dest);
                    const lineLabel = loc(x.lineName);
                    const stopId = `mtr-${x.line || mtrLine}-${x.time}`;
                    return (
                      <div className="item" key={`${x.line || ''}-${loc(x.dest)}-${x.time}-${i}`}>
                        <div className="eta">
                          <div>
                            {destName && i === 0 ? <span className="badge">{t('earliestArrival')}</span> : null}
                            {lineLabel ? <span className="badge">{lineLabel}</span> : null}
                            <b>{t('towards')}{lang === 'zh' ? '' : ' '}{loc(x.dest)}</b>
                            {when || plat ? <div className="muted">{[when, plat].filter(Boolean).join(' · ')}{destName ? ` · ${t('rideDeparts')}` : ''}</div> : null}
                            {x.arrive && destName ? (
                              <div className="muted">{clk(x.arrive)} {t('rideArrives')}{lang === 'zh' ? '' : ' '}{destName}{x.rideMinutes != null ? ` · ${t('rideMins', x.rideMinutes)}` : ''}</div>
                            ) : null}
                            {x.arrivalEstimated ? <div className="muted">{t('rideArriveGuessed')}</div> : null}
                          </div>
                          <span className="mins">{wait == null ? '' : t('minutes', wait)}</span>
                        </div>
                        {renderStopTimes(stopId, x.stops, x.stops?.length > 1 ? null : () => loadMtrStops(x))}
                      </div>
                    );
                  })
                  : <p className="muted">{t(mtrResult.emptyReason === 'unavailable' ? 'mtrUnavailable' : mtrResult.emptyReason === 'racecourse' ? 'mtrRacecourse' : mtrResult.emptyReason === 'empty' ? 'mtrEmptyLine' : mtrResult.emptyReason === 'no_dest' ? 'mtrNoTrainToDest' : 'noTrains')}</p>}
                <div className="row-actions">
                  <button className="tab" type="button" onClick={() => {
                    const line = lines[currentLineKey];
                    const sta = (line?.stations || []).find((row) => row[0] === currentSta);
                    const destRow = (line?.stations || []).find((row) => row[0] === mtrDest);
                    saveHome({
                      type: 'mtr',
                      title: { zh: `${lineName(line)} · ${sta?.[1]}`, en: `${line?.name.en} · ${sta?.[2]}` },
                      subtitle: destRow
                        ? { zh: `${sta?.[1]} → ${destRow[1]}`, en: `${sta?.[2]} → ${destRow[2]}` }
                        : { zh: t('nextTrains'), en: 'Next trains' },
                      payload: { line: currentLineKey, station: currentSta, dest: mtrDest || undefined }
                    });
                  }}>{t('saveHome')}</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section className={`panel${tab === 'home' ? ' active' : ''}`}>
        <div className="card">
          <h2 className="text-lg font-bold">{t('homeHeading')}</h2>
          <p className="muted">{t('homeHelp')}</p>
          <div>
            {homeError ? <div className="note">{homeError}</div> : null}
            {!homeError && !homes.length ? <p className="muted mt-3">{t('homeEmpty')}</p> : null}
            {homes.map((item) => (
              <div className="item" key={item.id}>
                <b>{loc(item.title)}</b>
                {item.pinned ? <span className="badge"> {t('pin')}</span> : null}
                <div className="muted">{loc(item.subtitle)} · {typeLabel(item.type)}</div>
                <div className="row-actions">
                  <button className="btn" type="button" onClick={() => openHome(item)}>{t('open')}</button>
                  <button className="tab" type="button" onClick={async () => {
                    await api(`/api/homes/${item.id}`, { method: 'PATCH', body: JSON.stringify({ pinned: !item.pinned }) });
                    renderHome();
                  }}>{item.pinned ? t('unpin') : t('pin')}</button>
                  <button className="tab" type="button" onClick={async () => {
                    await api(`/api/homes/${item.id}`, { method: 'DELETE' });
                    renderHome();
                  }}>{t('remove')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
