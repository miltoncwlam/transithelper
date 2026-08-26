'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { API_BASE, LOCAL_CONNECTION_REFUSED, SHOW_LOCAL_DEV_HINT } from '@/lib/apiBase.js';
import { I18N } from '../lib/i18n.js';
import { pickFollowedTrain } from '../lib/mtr.js';
import { mtrLineColor } from '../lib/mtrColors.js';
import { lineColorForCo } from '../lib/routeColors.js';
import { displayStopName } from '../lib/stopName.js';
import StopMap from './StopMap.js';
import UserGuide from './UserGuide.js';

function isLocalHost() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function showLocalDevHint() {
  return SHOW_LOCAL_DEV_HINT && isLocalHost();
}

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

function stopNameKey(x) {
  return (x?.name_tc || x?.name_en || '').normalize('NFKC').replace(/\s*\([^)]*\)\s*/g, '').replace(/[\s–—_.,'"-]+/g, '').toLowerCase();
}

function serviceCo(row) {
  if (row?.co) return String(row.co).toUpperCase();
  if (row?.gmb_route_id) return 'GMB';
  if (row?.nlb_route_id) return 'NLB';
  return 'KMB';
}

function coTone(row, companies) {
  const set = new Set((companies && companies.length ? companies : [serviceCo(row)]).map((c) => String(c).toUpperCase()));
  const hasCtb = set.has('CTB');
  const hasGmb = set.has('GMB');
  const hasNlb = set.has('NLB');
  const hasFranchised = [...set].some((c) => c !== 'CTB' && c !== 'GMB' && c !== 'NLB');
  if (hasCtb && hasFranchised) return 'pg-co-joint';
  if (hasGmb) return 'pg-co-gmb';
  if (hasNlb) return 'pg-co-nlb';
  if (hasCtb) return 'pg-co-ctb';
  if (set.has('LWB')) return 'pg-co-lwb';
  return 'pg-co-kmb';
}

function servicePlaceKey(x, side) {
  const tc = side === 'orig' ? (x.orig_tc || x.orig_en) : (x.dest_tc || x.dest_en);
  const en = side === 'orig' ? (x.orig_en || x.orig_tc) : (x.dest_en || x.dest_tc);
  return stopNameKey({ name_tc: tc, name_en: en });
}

function cluster(a) {
  a = [...new Set(a)].sort((x, y) => new Date(x) - new Date(y));
  return a.filter((x, i) => !i || new Date(x) - new Date(a[i - 1]) > 90000);
}

function emptyReasonKey(reason) {
  if (reason === 'no_first_bus') return 'noFirstBus';
  if (reason === 'no_connection') return 'noConnection';
  if (reason === 'no_departure') return 'noDeparture';
  if (reason === 'timeout') return 'transferTimeout';
  if (reason === 'incomplete') return 'incomplete';
  if (reason === 'need_board') return 'needBoard';
  if (reason === 'empty' || reason === 'no_departure') return 'noLiveNow';
  return 'none';
}

function readRecents() {
  try {
    const raw = JSON.parse(localStorage.getItem('tb-recents') || '{}');
    return { routes: raw.routes || [], stops: raw.stops || [] };
  } catch {
    return { routes: [], stops: [] };
  }
}

const HOMES_KEY = 'tb-homes';

function readLocalHomes() {
  try {
    const rows = JSON.parse(localStorage.getItem(HOMES_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeLocalHomes(rows) {
  try { localStorage.setItem(HOMES_KEY, JSON.stringify((rows || []).slice(0, 40))); } catch {}
}

function sortHomes(rows) {
  return [...rows].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function mergeHomes(remote, local) {
  const map = new Map();
  for (const row of [...(local || []), ...(remote || [])]) {
    if (row?.id) map.set(row.id, row);
  }
  return sortHomes([...map.values()]);
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
  const [arrivalFares, setArrivalFares] = useState(null);
  const [firstFares, setFirstFares] = useState(null);
  const [recents, setRecents] = useState({ routes: [], stops: [] });
  const [standaloneHint, setStandaloneHint] = useState(false);
  const [routeNearNote, setRouteNearNote] = useState('');
  const [routeLine, setRouteLine] = useState(null);

  const stopCache = useRef(new Map());
  const routeLineSeq = useRef(0);
  const arrivalSearchSeq = useRef(0);
  const arrivalPickSeq = useRef(0);
  const firstSearchSeq = useRef(0);
  const lastView = useRef(null);
  const arrivalBoardRef = useRef(null);
  const arrivalLiveRef = useRef(null);
  const transferSeq = useRef(0);
  const homeOpened = useRef(false);
  const stopMap = useMemo(() => new Map(stops.map((x) => [x.stop, x])), [stops]);

  const t = useCallback((key, ...args) => {
    if (key === 'connectionRefused' && showLocalDevHint()) {
      const localText = LOCAL_CONNECTION_REFUSED[lang];
      if (localText) return localText;
    }
    const value = I18N[lang][key];
    return typeof value === 'function' ? value(...args) : value;
  }, [lang]);

  const loc = useCallback((pair) => {
    if (!pair) return '';
    if (typeof pair === 'string') return pair;
    return lang === 'zh' ? (pair.zh || pair.en) : (pair.en || pair.zh);
  }, [lang]);

  const areaName = useCallback((x) => displayStopName(x, lang), [lang]);

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
    const { timeoutMs: givenTimeout, ...fetchOpts } = options;
    const heavy = path.startsWith('/api/transfer') || path.startsWith('/api/ride');
    const timeoutMs = givenTimeout || (heavy ? 30000 : 12000);
    const ctrl = new AbortController();
    const kill = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        cache: 'no-store',
        signal: ctrl.signal,
        headers: {
          Accept: 'application/json',
          'X-Device-Id': deviceId(),
          ...(fetchOpts.body ? { 'Content-Type': 'application/json' } : {}),
          ...(fetchOpts.headers || {})
        },
        ...fetchOpts
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json.error || t('none'));
        err.status = res.status;
        err.payload = json;
        throw err;
      }
      return json;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(path.startsWith('/api/transfer') ? t('transferTimeout') : t('timeout'));
      }
      throw error;
    } finally {
      clearTimeout(kill);
    }
  }, [t]);

  function pushRecent(kind, value) {
    if (value == null || value === '') return;
    const cur = readRecents();
    const token = JSON.stringify(value);
    const list = [value, ...(cur[kind] || []).filter((row) => JSON.stringify(row) !== token)].slice(0, 8);
    const next = { ...cur, [kind]: list };
    try { localStorage.setItem('tb-recents', JSON.stringify(next)); } catch {}
    setRecents(next);
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

  async function fetchStops(s) {
    const k = [serviceCo(s), s.route, s.bound, s.service_type, s.gmb_route_id || '', s.gmb_route_seq || '', s.nlb_route_id || ''].join('|');
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
    if (serviceCo(s) === 'NLB' && s.nlb_route_id) {
      const json = await api(`/api/nlb/route-stop/${encodeURIComponent(s.nlb_route_id)}`);
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
      if (serviceCo(s) === 'NLB' && s.nlb_route_id) {
        const json = await api(`/api/nlb/eta/${encodeURIComponent(s.nlb_route_id)}/${encodeURIComponent(stopId)}`);
        return (json.data || []).filter((x) => x.eta).map((x) => ({
          ...x,
          dir: 'O',
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
      const json = await api(`/api/kmb/route-eta/${encodeURIComponent(s.route)}/${s.service_type}`);
      return (json.data || []).filter((x) => x.eta && x.dir === s.bound);
    } catch {
      return [];
    }
  }

  async function loadChoices(routeStr) {
    const q = n(routeStr);
    if (q) pushRecent('routes', q);
    if (!q) return { error: 'noRoute' };
    try {
      const json = await api(`/api/search-live?route=${encodeURIComponent(q)}`, { timeoutMs: 15000 });
      if (json.error && !(json.keep || []).length) return { error: json.error };
      const keep = (json.keep || []).map((z) => ({
        ...z,
        note: z.note || (z.live?.length ? '' : t('noLiveNow'))
      }));
      return {
        keep,
        auto: keep.length === 1 ? keep[0].service : json.auto || null
      };
    } catch {
      return { error: 'timeout' };
    }
  }

  function hideArrivalResults() {
    arrivalSearchSeq.current += 1;
    arrivalPickSeq.current += 1;
    routeLineSeq.current += 1;
    setArrivalService(null);
    setArrivalGroups([]);
    setArrivalStopIndex('');
    setArrivalDestIndex('');
    setArrivalTimes(null);
    setArrivalFares(null);
    setFetchedStops({});
    setOpenStopKey(null);
    setRouteNearNote('');
    setRouteLine(null);
    lastView.current = null;
  }

  function hideFirstService() {
    firstSearchSeq.current += 1;
    setFirstService(null);
    setFirstGroups([]);
    setFirstBoxHidden(false);
    setBoardIndex('');
    setInterchangeIndex('');
    setFirstFares(null);
    setTransferResult(null);
    setTransferMessage('');
    setTransferPhase(null);
    setSelectedDeparture(null);
    setSelectedConnection(null);
    setChosenDirect(null);
  }

  function requestRouteLine(s, seq) {
    const lineId = ++routeLineSeq.current;
    setRouteLine({
      loading: true,
      coords: [],
      source: '',
      color: lineColorForCo(serviceCo(s))
    });
    api('/api/route-line', {
      method: 'POST',
      timeoutMs: 15000,
      body: JSON.stringify({
        route: s.route,
        co: serviceCo(s),
        bound: s.bound || '',
        orig: s.orig_tc || s.orig_en || '',
        dest: s.dest_tc || s.dest_en || '',
        td_route_id: s.td_route_id || '',
        stops: (seq || []).map((stop) => ({ lat: stop.lat, lng: stop.lng ?? stop.long }))
      })
    }).then((json) => {
      if (lineId !== routeLineSeq.current) return;
      setRouteLine({
        coords: json.coords || [],
        source: json.source || 'straight',
        color: json.color || lineColorForCo(serviceCo(s)),
        name: json.name || '',
        from: json.from || '',
        to: json.to || '',
        loading: false
      });
    }).catch(() => {
      if (lineId === routeLineSeq.current) {
        setRouteLine({ coords: [], source: 'straight', color: lineColorForCo(serviceCo(s)), loading: false });
      }
    });
  }

  const pickArrival = useCallback(async (s) => {
    const searchToken = arrivalSearchSeq.current;
    const pickToken = ++arrivalPickSeq.current;
    setArrivalService(s);
    setArrivalChoices(null);
    setArrivalGroups([]);
    setArrivalStopIndex('');
    setArrivalDestIndex('');
    setArrivalTimes(null);
    setFetchedStops({});
    setOpenStopKey(null);
    setRouteNearNote('');
    const seq = await fetchStops(s);
    if (searchToken !== arrivalSearchSeq.current || pickToken !== arrivalPickSeq.current) return;
    setArrivalGroups(groups(seq));
    requestRouteLine(s, seq);
    try {
      const qs = new URLSearchParams({ route: s.route, co: serviceCo(s), bound: s.bound || '' });
      const json = await api(`/api/fares?${qs}`);
      if (searchToken !== arrivalSearchSeq.current || pickToken !== arrivalPickSeq.current) return;
      setArrivalFares(json.fare || null);
    } catch {
      if (searchToken === arrivalSearchSeq.current && pickToken === arrivalPickSeq.current) setArrivalFares(null);
    }
  }, [api, lang, routes]);

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

  const chooseArrivalStop = useCallback(async (index, destIndex) => {
    const v = String(index);
    setArrivalStopIndex(v);
    setArrivalTimes(null);
    let dest = destIndex === undefined ? arrivalDestIndex : destIndex;
    if (dest !== '' && (v === '' || +dest <= +v)) {
      dest = '';
      setArrivalDestIndex('');
    } else if (destIndex !== undefined) {
      setArrivalDestIndex(String(dest));
    }
    if (v === '' || !arrivalService) return;
    const g = arrivalGroups[+v];
    const seq = g?.stops?.[0]?.seq;
    try {
      const qs = new URLSearchParams({ route: arrivalService.route, co: serviceCo(arrivalService), bound: arrivalService.bound || '' });
      if (seq) qs.set('on', String(seq));
      const json = await api(`/api/fares?${qs}`);
      setArrivalFares(json.fare || null);
    } catch {}
    await showArrival(arrivalService, arrivalGroups, v, dest);
  }, [api, arrivalDestIndex, arrivalGroups, arrivalService, showArrival]);

  const pickArrivalStopFromMap = useCallback((stop) => {
    if (stop?.index == null || stop.index === '') return;
    chooseArrivalStop(stop.index, '');
  }, [chooseArrivalStop]);

  async function swapArrivalBound() {
    if (!arrivalService) return;
    const co = serviceCo(arrivalService);
    const flipped = (routes || []).find((row) => {
      if (String(row.route).toUpperCase() !== String(arrivalService.route).toUpperCase()) return false;
      if (serviceCo(row) !== co) return false;
      if (co === 'GMB') {
        return String(row.gmb_route_id) === String(arrivalService.gmb_route_id)
          && String(row.gmb_route_seq || '') !== String(arrivalService.gmb_route_seq || '');
      }
      if (co === 'NLB') {
        return String(row.nlb_route_id) === String(arrivalService.nlb_route_id) && row.bound !== arrivalService.bound;
      }
      return String(row.service_type || '1') === String(arrivalService.service_type || '1') && row.bound !== arrivalService.bound;
    }) || {
      ...arrivalService,
      bound: arrivalService.bound === 'I' ? 'O' : 'I',
      orig_en: arrivalService.dest_en,
      dest_en: arrivalService.orig_en,
      orig_tc: arrivalService.dest_tc,
      dest_tc: arrivalService.orig_tc
    };
    setRouteNearNote('');
    await pickArrival(flipped);
  }

  function findNearestOnRoute() {
    if (!arrivalGroups.length) return;
    if (!navigator.geolocation) {
      setRouteNearNote(t('geoDenied'));
      return;
    }
    setRouteNearNote('');
    navigator.geolocation.getCurrentPosition((pos) => {
      let best = -1;
      let bestD = Infinity;
      arrivalGroups.forEach((g, i) => {
        const stop = g.stops?.[0];
        const lat = Number(stop?.lat);
        const lng = Number(stop?.long);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const d = Math.hypot((lat - pos.coords.latitude) * 111000, (lng - pos.coords.longitude) * 102000);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best < 0) {
        setRouteNearNote(t('noStops'));
        return;
      }
      chooseArrivalStop(best, '');
    }, () => setRouteNearNote(t('geoDenied')), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }

  const routeMapStops = useMemo(() => (
    arrivalGroups.map((g, i) => {
      const stop = g.stops?.[0];
      const lat = Number(stop?.lat);
      const lng = Number(stop?.long);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { ...stop, lat, lng, long: lng, seq: i + 1, index: i };
    }).filter(Boolean)
  ), [arrivalGroups]);

  const pickFirst = useCallback(async (s, restore = {}) => {
    const token = firstSearchSeq.current;
    setFirstService(s);
    setFirstChoices(null);
    setFirstBoxHidden(restore.keepBoxHidden !== false);
    setTransferResult(null);
    setTransferMessage('');
    setChosenDirect(null);
    setSelectedDeparture(null);
    setSelectedConnection(null);
    const seq = await fetchStops(s);
    if (token !== firstSearchSeq.current) return;
    setFirstGroups(groups(seq));
    try {
      const qs = new URLSearchParams({ route: s.route, co: serviceCo(s), bound: s.bound || '' });
      const json = await api(`/api/fares?${qs}`);
      setFirstFares(json.fare || null);
    } catch {
      setFirstFares(null);
    }
    if (restore.board != null) setBoardIndex(String(restore.board));
    if (restore.inter != null && (restore.board == null || +restore.inter >= +restore.board)) setInterchangeIndex(String(restore.inter));
    else if (restore.inter != null) setInterchangeIndex('');
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
        {x.arrive ? (
          <div className="muted">{clk(x.arrive)} {t('rideArrives')} {loc(x.to)}{x.rideMinutes != null ? ` · ${t('rideMins', x.rideMinutes)}` : ''}{x.totalMinutes != null ? ` · ${t('totalMins', x.totalMinutes)}` : ''}</div>
        ) : null}
        {x.arrivalEstimated ? <div className="muted">{t('rideArriveGuessed')}</div> : null}
        {x.kind === 'transfer' && x.waitAfterFirstMinutes != null ? (
          <div className="muted">{t('waitAfter', x.waitAfterFirstMinutes)}</div>
        ) : null}
        {fareNote(x)}
        {x.discount ? (
          <div className="muted"><span className="badge">{t('octopusDiscount')}</span> {lang === 'zh' ? x.discount.notes_zh : x.discount.notes_en} {t('discountNote')}</div>
        ) : null}
        {opts.pickHint ? <div className="muted">{t('pickConnection')}</div> : null}
        {!opts.onPick ? renderStopTimes(`xfer-${x.kind}-${x.route}-${x.eta}`, x.stops) : null}
      </>
    );
    if (opts.onPick) {
      return (
        <button className={`item choice pg-choice ${coTone(x)}`} type="button" key={`${x.kind}-${x.route}-${x.eta}-${i}`} onClick={opts.onPick}>
          {body}
        </button>
      );
    }
    return (
      <div className={`item ${coTone(x)}`} key={`${x.kind}-${x.route}-${x.eta}-${i}`}>
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
    if (Number(interVal) < Number(boardVal)) {
      setTransferResult(null);
      setTransferMessage(t('needFields'));
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
      setMtrResult({ ...r, line, sta });
      lastView.current = 'm';
    } catch {
      setMtrResult({ trains: [], emptyReason: 'unavailable', line, sta });
    }
  }, [api, currentLineKey, currentSta, mtrDest]);

  function coLabel(service, companies) {
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

  const renderHome = useCallback(async () => {
    const local = readLocalHomes();
    try {
      const json = await api('/api/homes');
      const rows = mergeHomes(json.data || [], local);
      setHomes(rows);
      setHomeError('');
      if (!homeOpened.current && rows.length) {
        homeOpened.current = true;
        setTab('home');
      }
    } catch (error) {
      const rows = sortHomes(local);
      setHomes(rows);
      setHomeError(rows.length ? '' : error.message);
      if (!homeOpened.current && rows.length) {
        homeOpened.current = true;
        setTab('home');
      }
    }
  }, [api]);

  async function saveHome(item) {
    const localRow = {
      id: `local-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      pinned: false,
      ...item
    };
    writeLocalHomes([localRow, ...readLocalHomes().filter((row) => JSON.stringify(row.payload) !== JSON.stringify(item.payload))]);
    setTab('home');
    try {
      const json = await api('/api/homes', { method: 'POST', body: JSON.stringify(item) });
      if (json.data?.id) {
        writeLocalHomes([json.data, ...readLocalHomes().filter((row) => row.id !== localRow.id && row.id !== json.data.id)]);
      }
      setHomeError('');
    } catch {
      setHomeError(t('homeSaveLocal'));
    }
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
      const seq = await fetchStops(s);
      const g = groups(seq);
      setArrivalGroups(g);
      requestRouteLine(s, seq);
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
    setRecents(readRecents());
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
      const headers = { Accept: 'application/json', 'X-Device-Id': deviceId() };
      async function pull(path, ms) {
        const ctrl = new AbortController();
        const kill = setTimeout(() => ctrl.abort(), ms);
        try {
          const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', signal: ctrl.signal, headers });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || 'fail');
          return json;
        } finally {
          clearTimeout(kill);
        }
      }
      let lastError;
      for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
        try {
          const [routeJson, stopJson, lineJson] = await Promise.all([
            pull('/api/kmb/routes', 25000),
            pull('/api/kmb/stops', 25000),
            pull('/api/mtr/lines', 25000)
          ]);
          if (cancelled) return;
          const nextRoutes = routeJson.data || [];
          setRoutes(nextRoutes);
          setStops(stopJson.data || []);
          setLines(lineJson.data || {});
          setDirCount(nextRoutes.length ? nextRoutes.length : -1);
          setOffline(false);
          setTimeout(async () => {
            if (cancelled) return;
            try {
              const later = await pull('/api/kmb/stops', 25000);
              const nextStops = later.data || [];
              if (nextStops.length > (stopJson.data || []).length) setStops(nextStops);
            } catch {}
          }, 12000);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
        }
      }
      if (lastError && !cancelled) {
        setDirCount(-1);
        const network = lastError?.name === 'TypeError' || /fetch|network|Failed to fetch|Load failed/i.test(String(lastError?.message || ''));
        setOffline(network);
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
    const first = currentLine?.stations?.[0]?.[0];
    if (!first) return;
    if (!mtrStation || !(currentLine.stations || []).some((row) => row[0] === mtrStation)) {
      setMtrStation(first);
    }
  }, [currentLine, mtrStation]);

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
    if (!arrivalService || !arrivalGroups.length) return undefined;
    const id = window.requestAnimationFrame(() => {
      arrivalBoardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(id);
  }, [arrivalService, arrivalGroups.length]);

  useEffect(() => {
    if (arrivalStopIndex === '' || !arrivalTimes) return undefined;
    const id = window.requestAnimationFrame(() => {
      arrivalLiveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [arrivalStopIndex, arrivalTimes]);

  useEffect(() => {
    if (!arrivalRoute.trim()) {
      hideArrivalResults();
      setArrivalChoices(null);
      return undefined;
    }
    hideArrivalResults();
    const gen = arrivalSearchSeq.current;
    setArrivalChoices({ loading: true });
    const handle = setTimeout(() => {
      (async () => {
        const payload = await loadChoices(arrivalRoute);
        if (gen !== arrivalSearchSeq.current) return;
        setArrivalChoices(payload);
        if (payload.auto) pickArrival(payload.auto);
      })();
    }, 400);
    return () => clearTimeout(handle);
  }, [arrivalRoute]);

  useEffect(() => {
    if (!firstRoute.trim()) {
      hideFirstService();
      setFirstChoices(null);
      return undefined;
    }
    hideFirstService();
    const gen = firstSearchSeq.current;
    setFirstChoices({ loading: true });
    const handle = setTimeout(() => {
      (async () => {
        const payload = await loadChoices(firstRoute);
        if (gen !== firstSearchSeq.current) return;
        setFirstChoices(payload);
        if (payload.auto) pickFirst(payload.auto);
      })();
    }, 400);
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
    const extra = fetchedStops[id];
    if (stops?.terminus || extra?.terminus) return { terminus: true };
    if (extra === 'loading') return extra;
    if (Array.isArray(extra) && extra.length > 1) return extra;
    if (Array.isArray(stops) && stops.length > 1) return stops;
    if (Array.isArray(extra) && extra.length) return extra;
    if (Array.isArray(stops) && stops.length) return stops;
    return [];
  }

  function renderStopTimes(id, stops, fetchStops) {
    const list = resolvedStops(id, stops);
    const terminus = !!list?.terminus;
    const loading = fetchedStops[id] === 'loading';
    const canOpen = terminus || (Array.isArray(list) && list.length > 1) || loading || fetchStops;
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
            if (!terminus && (!Array.isArray(list) || list.length < 2) && fetchStops) await fetchStops();
          }}
        >
          {open ? t('hideStopTimes') : t('showStopTimes')}
        </button>
        {open && loading ? <p className="muted mt-2">{t('stopTimesLoading')}</p> : null}
        {open && !loading && terminus ? <p className="muted mt-2">{t('stopTimesTerminus')}</p> : null}
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
        {open && !loading && !terminus && Array.isArray(list) && list.length <= 1 ? <p className="muted mt-2">{t('stopTimesEmpty')}</p> : null}
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
    const line = train.line || currentLineKey;
    const sta = mtrResult?.sta || currentSta;
    const destCode = String(train.destCode || '').trim().toUpperCase();
    const key = `mtr-${line}-${sta}-${destCode}-${train.time}`;
    if (train.terminus || destCode === sta) {
      setFetchedStops((prev) => ({ ...prev, [key]: { terminus: true } }));
      return { terminus: true };
    }
    if (Array.isArray(train.stops) && train.stops.length > 1) return train.stops;
    if (fetchedStops[key] === 'loading' || fetchedStops[key]?.terminus || (Array.isArray(fetchedStops[key]) && fetchedStops[key].length)) {
      return fetchedStops[key];
    }
    if (!line || !sta || !destCode) {
      setFetchedStops((prev) => ({ ...prev, [key]: [] }));
      return [];
    }
    setFetchedStops((prev) => ({ ...prev, [key]: 'loading' }));
    try {
      const json = await api(`/api/mtr/schedule?line=${encodeURIComponent(line)}&sta=${encodeURIComponent(sta)}&dest=${encodeURIComponent(destCode)}&sameLine=1`);
      const hit = pickFollowedTrain(json.trains || [], { ...train, line, destCode });
      if (hit?.terminus || destCode === sta) {
        setFetchedStops((prev) => ({ ...prev, [key]: { terminus: true } }));
        return { terminus: true };
      }
      const stops = hit?.stops || [];
      setFetchedStops((prev) => ({ ...prev, [key]: stops }));
      return stops;
    } catch {
      setFetchedStops((prev) => ({ ...prev, [key]: [] }));
      return [];
    }
  }, [api, currentLineKey, currentSta, fetchedStops, mtrResult]);

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
      const wait = x.arrive ? mins(x.arrive) : mins(board);
      if (wait == null) return null;
      const service = x.route
        ? <><span className="badge">{coLabel(x)}</span> <b>{x.route}</b>{loc(x.dest) ? <div>{t('towards')}{lang === 'zh' ? '' : ' '}{loc(x.dest)}</div> : null}</>
        : <b>{clk(board)}</b>;
      const stopId = `arrival-${board}`;
      return (
        <div className={`item ${x.route ? coTone(x) : ''}`} key={`${x.route || ''}-${board}-${i}`}>
          <div className="eta">
            <div>
              {destLabel && i === 0 ? <span className="badge">{t('earliestArrival')}</span> : null}{service}
              {x.route ? <div className="muted">{clk(board)} {t('rideDeparts')}</div> : null}
              {x.arrive ? (
                <div className="muted">{clk(x.arrive)} {t('rideArrives')}{destLabel ? `${lang === 'zh' ? '' : ' '}${destLabel}` : ''}{x.rideMinutes != null ? ` · ${t('rideMins', x.rideMinutes)}` : ''}</div>
              ) : null}
              {x.arrivalEstimated ? <div className="muted">{t('rideArriveGuessed')}</div> : null}
            </div>
            <span className="mins">{t('minutes', wait)}</span>
          </div>
          {renderStopTimes(stopId, x.stops, opts.fetchStops ? () => loadArrivalStops(x) : null)}
        </div>
      );
    }).filter(Boolean);
    return rows.length ? rows : <p className="muted">{t(isRide ? 'noLiveNow' : 'noEta')}</p>;
  };

  function fareChip(n) {
    if (n == null || !Number.isFinite(Number(n))) return '';
    return `$${Number(n).toFixed(1)}`;
  }

  function odFare(fromGroup, toGroup, fares) {
    const on = Number(fromGroup?.stops?.[0]?.seq);
    const off = Number(toGroup?.stops?.[0]?.seq);
    if (!on || !off || off <= on) return null;
    return fares?.fares_from_board?.[off - on - 1] ?? null;
  }

  function fareLabel(group, extra) {
    const chip = fareChip(extra);
    return chip ? `${group.label}  ${chip}` : group.label;
  }

  function terminusFareForGroup(fares, group) {
    const seq = Number(group?.stops?.[0]?.seq);
    if (!fares?.terminus_fares || !Number.isFinite(seq) || seq < 1) return null;
    return fares.terminus_fares[seq - 1] ?? null;
  }

  function fareNote(x, opts = {}) {
    if (!x) return null;
    const parts = [];
    if (x.section_fare_hkd != null) parts.push(t('sectionFare', x.section_fare_hkd));
    else if (x.full_fare_hkd != null) parts.push(t('fullFare', x.full_fare_hkd));
    if (x.section_fare_hkd != null && x.full_fare_hkd != null && Number(x.section_fare_hkd) !== Number(x.full_fare_hkd)) {
      parts.push(t('fullFare', x.full_fare_hkd));
    }
    if (x.rideMinutes > 0) parts.push(t('rideMins', x.rideMinutes));
    else if (x.totalMinutes > 0) parts.push(t('totalMins', x.totalMinutes));
    else if (x.journey_time_minutes != null && !opts.hideScheduled) parts.push(t('scheduledMins', x.journey_time_minutes));
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
          <button key={`${z.service.co || 'KMB'}-${z.service.route}-${z.service.bound}-${z.service.service_type}-${z.service.gmb_route_id || z.service.nlb_route_id || ''}-${i}`} className={`item choice pg-choice ${coTone(z.service, z.companies)}`} type="button" onClick={() => onPick(z.service)}>
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
    <div className="playground-page">
      <div className="pg-stripe" aria-hidden="true" />
    <main className="shell playground-ui">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">HK</span>
          <div>
            <h1 className="text-xl pg-title">{t('title')}</h1>
            <p className="brand-kicker app-tagline">{t('subtitle')}</p>
          </div>
        </div>
        <div className="app-controls">
          <button
            className="tab pg-lang"
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
          <Link className="tab pg-map" href="/playground">{t('playgroundBtn')}</Link>
          <button className={`tab pg-guide${tab === 'guide' ? ' active' : ''}`} type="button" onClick={() => setTab('guide')}>{t('guideBtn')}</button>
          <select className="field" value={refreshSec} onChange={(e) => setRefreshSec(e.target.value)}>
            <option value="15">{t('refresh15')}</option>
            <option value="30">{t('refresh30')}</option>
          </select>
        </div>
      </header>
      <div className="note">{dirCount == null ? t('loading') : dirCount < 0 ? (offline && showLocalDevHint() ? t('connectionRefused') : t('loadFail')) : t('ready', dirCount)}</div>
      {standaloneHint ? <p className="muted add-home-hint">{t('addHomeScreen')}</p> : null}
      <nav className="tabs my-5">
        {tabs.map(([id, label]) => (
          <button key={id} className={`tab tab-${id}${tab === id ? ' active' : ''}`} type="button" onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      <section className={`panel${tab === 'arrivals' ? ' active' : ''}`}>
        <div className="card">
          <h2 className="text-lg font-bold">{t('arrivalsHeading')}</h2>
          {!arrivalService && recents.routes.length ? (
            <div className="mt-2">
              <div className="muted">{t('recentRoutes')}</div>
              <div className="row-actions recent-routes">
                {recents.routes.map((route) => (
                  <button key={route} className="tab" type="button" onClick={() => setArrivalRoute(route)}>{route}</button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="search-row mt-3">
            <input className="field" placeholder={t('routePlaceholder')} value={arrivalRoute} onChange={(e) => setArrivalRoute(e.target.value)} aria-label={t('routePlaceholder')} />
              <button className="btn" type="button" aria-label={t('find')} onClick={async () => {
                hideArrivalResults();
                const gen = arrivalSearchSeq.current;
                setArrivalChoices({ loading: true });
                const payload = await loadChoices(arrivalRoute);
                if (gen !== arrivalSearchSeq.current) return;
                setArrivalChoices(payload);
                if (payload.auto) pickArrival(payload.auto);
              }}>{t('find')}</button>
          </div>
          <div>{renderChoiceList(arrivalChoices, pickArrival)}</div>
          {arrivalService ? (
            <div className="arrival-board" ref={arrivalBoardRef}>
              <h3 className={`font-bold mt-3 pg-route ${coTone(arrivalService)}`}><span className="badge">{coLabel(arrivalService)}</span> {arrivalService.route}</h3>
              <div className="muted">{rn(arrivalService)}</div>
              <div className="row-actions">
                <button className="tab" type="button" onClick={swapArrivalBound}>{t('reverseBound')}</button>
                <button className="tab" type="button" onClick={findNearestOnRoute}>{t('nearestStop')}</button>
              </div>
              {routeNearNote ? <p className="muted">{routeNearNote}</p> : null}
              {arrivalGroups.length ? (
                <label className="block mt-3">
                  <span>{t('chooseStop')}</span>
                  <select
                    className="field mt-1"
                    value={arrivalStopIndex}
                    aria-label={t('chooseStop')}
                    onChange={(e) => chooseArrivalStop(e.target.value, '')}
                  >
                    <option value="">{t('chooseStop')}</option>
                    {arrivalGroups.map((g, i) => (
                      <option key={`${g.label}-${i}`} value={String(i)}>
                        {`${i + 1}. ${fareLabel(g, terminusFareForGroup(arrivalFares, g))}`}
                      </option>
                    ))}
                  </select>
                  <span className="muted block mt-1">{t('stopMapHint')}</span>
                </label>
              ) : null}
              {routeMapStops.length >= 2 ? (
                <div className="mt-3">
                  <StopMap
                    mode="route"
                    center={[routeMapStops[0].lat, routeMapStops[0].lng]}
                    routeStops={routeMapStops}
                    selectedIndex={arrivalStopIndex}
                    path={routeLine?.coords}
                    lineColor={routeLine?.color || lineColorForCo(serviceCo(arrivalService))}
                    markerColor={routeLine?.color || lineColorForCo(serviceCo(arrivalService))}
                    onPick={pickArrivalStopFromMap}
                    className={arrivalStopIndex !== '' ? 'stop-map-picked' : ''}
                  />
                  {routeLine?.loading ? <p className="muted">{t('playgroundLoading')}</p> : null}
                  {!routeLine?.loading && routeLine?.source === 'official' ? <p className="muted">{t('playgroundSourceOfficial')}</p> : null}
                  {!routeLine?.loading && routeLine?.source === 'osm' ? <p className="muted">{t('playgroundSourceOsm')}</p> : null}
                  {!routeLine?.loading && routeLine?.source === 'osrm' ? <p className="muted">{t('playgroundSourceRoad')}</p> : null}
                  {!routeLine?.loading && routeLine?.source === 'straight' ? <p className="muted">{t('playgroundSourceStraight')}</p> : null}
                </div>
              ) : null}
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
                      i > +arrivalStopIndex ? <option key={`d-${g.label}-${i}`} value={i}>{fareLabel(g, odFare(arrivalGroups[+arrivalStopIndex], g, arrivalFares))}</option> : null
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
          {arrivalTimes && arrivalStopIndex !== '' ? (
            <div ref={arrivalLiveRef}>
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
            </div>
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
                hideFirstService();
                const gen = firstSearchSeq.current;
                setFirstChoices({ loading: true });
                const payload = await loadChoices(firstRoute);
                if (gen !== firstSearchSeq.current) return;
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
                <select className="field mt-1" value={boardIndex} aria-label={t('boardStop')} onChange={(e) => {
                  const v = e.target.value;
                  setBoardIndex(v);
                  if (interchangeIndex !== '' && (v === '' || +interchangeIndex < +v)) setInterchangeIndex('');
                }}>
                  <option value="">{t('notSelected')}</option>
                  {firstGroups.map((g, i) => <option key={`b-${g.label}-${i}`} value={i}>{fareLabel(g, terminusFareForGroup(firstFares, g))}</option>)}
                </select>
              </label>
              <label>{t('interchangeStop')}
                <select className="field mt-1" value={interchangeIndex} aria-label={t('interchangeStop')} onChange={(e) => setInterchangeIndex(e.target.value)}>
                  <option value="">{t('chooseInterchange')}</option>
                  {firstGroups.map((g, i) => (
                    boardIndex !== '' && i >= +boardIndex
                      ? <option key={`i-${g.label}-${i}`} value={i}>{fareLabel(g, odFare(firstGroups[+boardIndex], g, firstFares) || terminusFareForGroup(firstFares, g))}</option>
                      : null
                  ))}
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
                    <button key={x.label + i} className="item choice pg-choice pg-stop" type="button" onClick={() => {
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
                            className={`item choice pg-choice ${coTone(firstService)}`}
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
                            {row.arrive ? <div className="muted">{clk(row.arrive)} {t('rideArrives')}{row.rideMinutes != null ? ` · ${t('rideMins', row.rideMinutes)}` : ''}</div> : null}
                            {row.arrivalEstimated ? <div className="muted">{t('rideArriveGuessed')}</div> : null}
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
                          className={`item choice pg-choice ${coTone(x)}`}
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
                          {x.arrive ? <div className="muted">{clk(x.arrive)} {t('rideArrives')} {loc(x.to)}{x.rideMinutes != null ? ` · ${t('rideMins', x.rideMinutes)}` : ''}</div> : null}
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
            <div className="mtr-line-row mt-1">
              <span className="mtr-line-pip" style={{ background: mtrLineColor(currentLineKey) }} aria-hidden="true" />
              <select className="field" value={currentLineKey} onChange={(e) => {
                const next = e.target.value;
                setMtrLine(next);
                setMtrStation(lines[next]?.stations?.[0]?.[0] || '');
                setMtrDest('');
              }} aria-label={t('mtrLineLabel')}>
                {lineEntries.map(([k, v]) => <option key={k} value={k}>{lineName(v)}</option>)}
              </select>
            </div>
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
                    const boarding = mtrResult?.sta || currentSta;
                    const terminus = !!(x.terminus || (x.destCode && String(x.destCode).toUpperCase() === String(boarding).toUpperCase()));
                    const stopId = `mtr-${x.line || currentLineKey}-${boarding}-${x.destCode}-${x.time}`;
                    return (
                      <div className="item" key={`${x.line || ''}-${loc(x.dest)}-${x.time}-${i}`}>
                        <div className="eta">
                          <div>
                            {destName && i === 0 ? <span className="badge">{t('earliestArrival')}</span> : null}
                            {x.route ? <span className="badge">{x.route}</span> : null}
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
                        {x.line !== 'LRT' ? renderStopTimes(stopId, terminus ? { terminus: true } : x.stops, terminus || x.stops?.length > 1 ? null : () => loadMtrStops(x)) : null}
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
            {!homes.length ? <p className="muted mt-3">{t('homeEmpty')}</p> : null}
            {homes.map((item) => (
              <div className="item" key={item.id}>
                <b>{loc(item.title)}</b>
                {item.pinned ? <span className="badge"> {t('pin')}</span> : null}
                <div className="muted">{loc(item.subtitle)} · {typeLabel(item.type)}</div>
                <div className="row-actions">
                  <button className="btn" type="button" onClick={() => openHome(item)}>{t('open')}</button>
                  <button className="tab" type="button" onClick={async () => {
                    const nextPinned = !item.pinned;
                    writeLocalHomes(readLocalHomes().map((row) => row.id === item.id ? { ...row, pinned: nextPinned } : row));
                    try {
                      await api(`/api/homes/${item.id}`, { method: 'PATCH', body: JSON.stringify({ pinned: nextPinned }) });
                    } catch {}
                    renderHome();
                  }}>{item.pinned ? t('unpin') : t('pin')}</button>
                  <button className="tab" type="button" onClick={async () => {
                    writeLocalHomes(readLocalHomes().filter((row) => row.id !== item.id));
                    try {
                      await api(`/api/homes/${item.id}`, { method: 'DELETE' });
                    } catch {}
                    renderHome();
                  }}>{t('remove')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`panel${tab === 'guide' ? ' active' : ''}`}>
        <div className="card">
          <UserGuide lang={lang} />
        </div>
      </section>
    </main>
    </div>
  );
}
