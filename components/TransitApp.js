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

function cluster(a) {
  a = [...new Set(a)].sort((x, y) => new Date(x) - new Date(y));
  return a.filter((x, i) => !i || new Date(x) - new Date(a[i - 1]) > 90000);
}

function emptyReasonKey(reason) {
  if (reason === 'no_first_bus') return 'noFirstBus';
  if (reason === 'no_connection') return 'noConnection';
  if (reason === 'timeout') return 'timeout';
  if (reason === 'incomplete') return 'incomplete';
  if (reason === 'need_board') return 'needBoard';
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
  const [arrivalTimes, setArrivalTimes] = useState(null);

  const [journeyState, setJourneyState] = useState('wait');
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

  const [mtrLine, setMtrLine] = useState('');
  const [mtrStation, setMtrStation] = useState('');
  const [mtrResult, setMtrResult] = useState(null);

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

  function vars(r) {
    const seen = new Set();
    return routes.filter((x) => n(x.route) === n(r)).filter((x) => {
      const k = [x.bound, x.service_type, x.orig_en, x.dest_en].join('|');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  async function fetchStops(s) {
    const k = [s.co || 'KMB', s.route, s.bound, s.service_type, s.gmb_route_id || '', s.gmb_route_seq || ''].join('|');
    if (stopCache.current.has(k)) return stopCache.current.get(k);
    if (s.co === 'CTB') {
      const d = s.bound === 'I' ? 'inbound' : 'outbound';
      const json = await api(`/api/citybus/route-stop/${encodeURIComponent(s.route)}/${d}`);
      const rows = json.data || [];
      stopCache.current.set(k, rows);
      return rows;
    }
    if (s.co === 'GMB' && s.gmb_route_id) {
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

  async function routeLive(s) {
    if (s.co === 'CTB' || s.co === 'GMB') return [{ eta: true, dir: s.bound }];
    try {
      const json = await api(`/api/kmb/route-eta/${encodeURIComponent(s.route)}/${s.service_type}`);
      return (json.data || []).filter((x) => x.eta && x.dir === s.bound);
    } catch {
      return [];
    }
  }

  function patternNote(v, base, sets) {
    if (v === base) return t('standard', sets.get(v).length);
    const a = sets.get(v);
    const b = sets.get(base);
    const skipped = b.filter((x) => !a.some((y) => y.stop === x.stop)).map(areaName).filter(Boolean);
    const extra = a.filter((x) => !b.some((y) => y.stop === x.stop)).map(areaName).filter(Boolean);
    const parts = [t('variant', a.length, b.length)];
    const join = (arr) => arr.slice(0, 4).join(lang === 'zh' ? '、' : ', ') + (arr.length > 4 ? t('more', arr.length - 4) : '');
    if (skipped.length) parts.push(t('skips', join(skipped)));
    if (extra.length) parts.push(t('extras', join(extra)));
    if (!skipped.length && !extra.length) parts.push(t('sameStops'));
    return parts.join(' ');
  }

  async function loadChoices(routeStr) {
    let rows = vars(routeStr);
    if (!rows.length) {
      try {
        const json = await api(`/api/gmb/lookup?route=${encodeURIComponent(n(routeStr))}`);
        rows = json.data || [];
      } catch {
        rows = [];
      }
    }
    if (!rows.length) return { error: 'noRoute' };
    const limited = rows.slice(0, 8);
    const info = await Promise.all(limited.map(async (x) => {
      let live = [];
      let seq = [];
      try { live = await routeLive(x); } catch {}
      try { seq = await fetchStops(x); } catch {}
      return { x, live, seq };
    }));
    let keep = info.filter((z) => String(z.x.service_type) === '1' || z.live.length > 0);
    if (!keep.length) keep = info.filter((z) => z.seq.length);
    if (!keep.length) return { error: 'routeUnavailable' };
    if (keep.length === 1) {
      return {
        keep: [{
          service: keep[0].x,
          live: keep[0].live,
          note: '',
          hasVariants: false
        }],
        auto: keep[0].x
      };
    }
    const byJourney = new Map();
    keep.forEach((z) => {
      const k = [z.x.bound, n(z.x.orig_en), n(z.x.dest_en)].join('|');
      if (!byJourney.has(k)) byJourney.set(k, []);
      byJourney.get(k).push(z);
    });
    const notes = new Map();
    byJourney.forEach((list) => {
      const base = list.find((z) => String(z.x.service_type) === '1') || list.slice().sort((a, b) => b.seq.length - a.seq.length)[0];
      const sets = new Map(list.map((z) => [z.x, z.seq]));
      list.forEach((z) => notes.set(z, patternNote(z.x, base.x, sets)));
    });
    return {
      keep: keep.map((z) => ({
        service: z.x,
        live: z.live,
        note: notes.get(z) || '',
        hasVariants: (byJourney.get([z.x.bound, n(z.x.orig_en), n(z.x.dest_en)].join('|')) || []).length > 1
      }))
    };
  }

  async function eta(stop, s) {
    try {
      if (s.co === 'CTB') {
        const json = await api(`/api/citybus/eta/${encodeURIComponent(stop)}/${encodeURIComponent(s.route)}`);
        return (json.data || []).filter((x) => x.eta).map((x) => ({ ...x, dir: s.bound, service_type: '1', route: s.route }));
      }
      if (s.co === 'GMB') {
        const json = await api(`/api/gmb/eta/${encodeURIComponent(stop)}`);
        return (json.data || []).filter((x) => x.eta).map((x) => ({ ...x, dir: s.bound, service_type: '1', route: s.route }));
      }
      const json = await api(`/api/kmb/stop-eta/${encodeURIComponent(stop)}`);
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

  const pickArrival = useCallback(async (s) => {
    setArrivalService(s);
    setArrivalChoices(null);
    setArrivalStopIndex('');
    setArrivalTimes(null);
    setArrivalGroups(groups(await fetchStops(s)));
  }, [api, lang, routes]); // groups depends on lang

  const showArrival = useCallback(async (service, groupsList, index) => {
    if (index === '' || !service) return;
    const g = groupsList[+index];
    if (!g) return;
    let a = [];
    for (const x of g.stops) a = a.concat(await eta(x.stop, service));
    setArrivalTimes(cluster(a.map((x) => x.eta)));
    lastView.current = 'a';
  }, [api, lang]);

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
    const state = opts.journeyState ?? journeyState;
    if (state === 'wait' && (opts.boardIndex ?? boardIndex) === '') {
      setTransferResult(null);
      setTransferMessage(t('needBoard'));
      return;
    }
    const seq = ++transferSeq.current;
    setTransferMessage(t('searching'));
    setTransferResult(null);
    try {
      const inter = fg[+interVal];
      const json = await api('/api/transfer', {
        method: 'POST',
        body: JSON.stringify({
          state: opts.journeyState ?? journeyState,
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
      setTransferResult({ json, inter });
      lastView.current = 't';
    } catch (e) {
      if (seq !== transferSeq.current) return;
      setTransferResult(null);
      setTransferMessage(e.message || t('none'));
    }
  }, [api, firstService, destination, firstGroups, interchangeIndex, boardIndex, journeyState, nearby, radius, t]);

  const lineName = (line) => loc(line.name) || line.name;
  const stationLabel = (row) => (lang === 'zh' ? row[1] : row[2]);

  const lineEntries = Object.entries(lines);
  const currentLine = lines[mtrLine] || lineEntries[0]?.[1];
  const currentLineKey = lines[mtrLine] ? mtrLine : (lineEntries[0]?.[0] || '');
  const currentStations = currentLine?.stations || [];
  const currentSta = currentStations.some((row) => row[0] === mtrStation)
    ? mtrStation
    : (currentStations[0]?.[0] || '');

  const showMtr = useCallback(async (line = currentLineKey, sta = currentSta) => {
    if (!line || !sta) return;
    try {
      const r = await api(`/api/mtr/schedule?line=${encodeURIComponent(line)}&sta=${encodeURIComponent(sta)}`);
      setMtrResult(r);
      lastView.current = 'm';
    } catch {
      setMtrResult({ trains: [], emptyReason: 'unavailable' });
    }
  }, [api, currentLineKey, currentSta]);

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

  async function pickNearbyStop(stop) {
    setNearbyList((prev) => ({ ...(prev || {}), picked: stop }));
    try {
      const json = await api(`/api/kmb/stop-eta/${encodeURIComponent(stop.stop)}`);
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
      await showArrival(s, g, idx);
    } else if (item.type === 'transfer') {
      setTab('transfer');
      setJourneyState(item.payload.state || 'wait');
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
      await goTransfer({
        firstService: s,
        firstGroups: g,
        destination: dest,
        boardIndex: bIdx,
        interchangeIndex: iIdx,
        journeyState: item.payload.state || 'wait',
        nearby: item.payload.nearby !== false,
        radius: item.payload.radius || '250'
      });
    } else if (item.type === 'mtr') {
      setTab('mtr');
      setMtrLine(item.payload.line);
      setMtrStation(item.payload.station);
      await showMtr(item.payload.line, item.payload.station);
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
      if (lastView.current === 't') goTransfer();
      if (lastView.current === 'm') showMtr();
    }, +refreshSec * 1000);
    return () => clearInterval(id);
  }, [refreshSec, arrivalService, arrivalGroups, arrivalStopIndex, showArrival, goTransfer, showMtr]);

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

  const etaList = (times) => {
    if (!times.length) return <p className="muted">{t('noEta')}</p>;
    const rows = times.map((x) => {
      const wait = mins(x);
      if (wait == null) return null;
      return (
        <div className="item eta" key={x}>
          <b>{clk(x)}</b>
          <span className="mins">{t('minutes', wait)}</span>
        </div>
      );
    }).filter(Boolean);
    return rows.length ? rows : <p className="muted">{t('noEta')}</p>;
  };

  function renderChoiceList(payload, onPick) {
    if (!payload) return null;
    if (payload.loading) return <div className="note">{t('checking')}</div>;
    if (payload.error) return <p className="muted">{t(payload.error)}</p>;
    return payload.keep.map((z, i) => (
      <button key={`${z.service.route}-${z.service.bound}-${z.service.service_type}-${i}`} className="item choice" type="button" onClick={() => onPick(z.service)}>
        <b>{z.service.route}</b>
        <div>{rn(z.service)}</div>
        {(z.hasVariants || String(z.service.service_type) !== '1') ? <div className="muted">{z.note}</div> : null}
        {z.live.length === 0 ? <div className="muted">{t('inactive')}</div> : null}
      </button>
    ));
  }

  const tabs = [
    ['arrivals', t('tabArrivals')],
    ['transfer', t('tabTransfer')],
    ['mtr', t('tabMtr')],
    ['home', t('tabHome')]
  ];

  const transferEmpty = transferResult?.json?.emptyReason && !transferResult.json.list?.length
    ? t(emptyReasonKey(transferResult.json.emptyReason))
    : '';

  return (
    <main className="shell">
      <header className="flex justify-between gap-3 mb-4 items-start">
        <div>
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <p className="muted">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2 items-center">
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
          <select className="field" style={{ width: 'auto' }} value={refreshSec} onChange={(e) => setRefreshSec(e.target.value)}>
            <option value="15">{t('refresh15')}</option>
            <option value="30">{t('refresh30')}</option>
          </select>
        </div>
      </header>
      <div className="note">{dirCount == null ? t('loading') : dirCount < 0 ? (offline ? t('connectionRefused') : t('loadFail')) : t('ready', dirCount)}</div>
      {standaloneHint ? <p className="muted">{t('addHomeScreen')}</p> : null}
      <nav className="flex gap-2 flex-wrap my-5">
        {tabs.map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? ' active' : ''}`} type="button" onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      <section className={`panel${tab === 'arrivals' ? ' active' : ''}`}>
        <div className="card">
          <h2 className="text-lg font-bold">{t('arrivalsHeading')}</h2>
          <div className="flex gap-2 mt-3">
            <input className="field" placeholder={t('routePlaceholder')} value={arrivalRoute} onChange={(e) => setArrivalRoute(e.target.value)} aria-label={t('routePlaceholder')} />
              <button className="btn" type="button" aria-label={t('find')} onClick={async () => {
                setArrivalChoices({ loading: true });
                const payload = await loadChoices(arrivalRoute);
                setArrivalChoices(payload);
                if (payload.auto) pickArrival(payload.auto);
              }}>{t('find')}</button>
          </div>
          <button className="tab mt-3" type="button" aria-label={t('nearbyStops')} onClick={findNearbyStops}>{t('nearbyStops')}</button>
          {nearbyList?.loading ? <div className="note">{t('locating')}</div> : null}
          {nearbyList?.error ? <p className="muted">{nearbyList.error === 'geoDenied' ? t('geoDenied') : nearbyList.error}</p> : null}
          {nearbyList?.data?.length ? (
            <div className="mt-2">
              {nearbyList.data.map((stop) => (
                <button key={stop.stop} className="item choice" type="button" onClick={() => pickNearbyStop(stop)}>
                  <b>{lang === 'zh' ? stop.name_tc || stop.name_en : stop.name_en || stop.name_tc}</b>
                  <div className="muted">{t('metres', stop.metres)}</div>
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
                : <p className="muted">{t('noEta')}</p>}
            </>
          ) : null}
          <div>{renderChoiceList(arrivalChoices, pickArrival)}</div>
          {arrivalService ? (
            <select className="field mt-3" value={arrivalStopIndex} onChange={async (e) => {
              const v = e.target.value;
              setArrivalStopIndex(v);
              await showArrival(arrivalService, arrivalGroups, v);
            }}>
              <option value="">{t('chooseStop')}</option>
              {arrivalGroups.map((g, i) => <option key={g.label + i} value={i}>{g.label}</option>)}
            </select>
          ) : null}
          {arrivalTimes && arrivalStopIndex !== '' ? (
            <>
              <h3 className="font-bold mt-3">{arrivalGroups[+arrivalStopIndex]?.label}</h3>
              {etaList(arrivalTimes)}
              <div className="row-actions">
                <button className="tab" type="button" onClick={() => {
                  const g = arrivalGroups[+arrivalStopIndex];
                  saveHome({
                    type: 'arrival',
                    title: { zh: `${arrivalService.route}（${areaName(g.stops[0])}）`, en: `${arrivalService.route} at ${g.stops[0].name_en || g.stops[0].name_tc}` },
                    subtitle: { zh: `${arrivalService.orig_tc || arrivalService.orig_en} → ${arrivalService.dest_tc || arrivalService.dest_en}`, en: `${arrivalService.orig_en || arrivalService.orig_tc} → ${arrivalService.dest_en || arrivalService.dest_tc}` },
                    payload: { service: arrivalService, stopIndex: +arrivalStopIndex }
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
            <span>{t('stateLabel')}</span>
            <select className="field mt-1" value={journeyState} onChange={(e) => setJourneyState(e.target.value)}>
              <option value="wait">{t('wait')}</option>
              <option value="onboard">{t('onboard')}</option>
            </select>
          </label>
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
            <div className="flex gap-2 mt-1">
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
              <button className="tab mt-2" type="button" onClick={() => setFirstBoxHidden(false)}>{t('change')}</button>
            </div>
          ) : null}
          {firstService ? (
            <div className="md-grid-2 mt-4">
              <label>{journeyState === 'wait' ? t('boardStop') : t('boardOptional')}
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
            <div className="flex gap-2 mt-1">
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
          <button className="btn mt-4" type="button" aria-label={t('transferFind')} onClick={() => goTransfer()}>{t('transferFind')}</button>
          <div>
            {transferMessage ? <div className="note">{transferMessage}</div> : null}
            {transferResult ? (
              <>
                {transferResult.json.firstArrivalAtInterchange ? (
                  <div className="note">
                    <h3 className="font-bold">{t('firstArrival')}</h3>
                    <div className="eta mt-2">
                      <b>{clk(transferResult.json.firstArrivalAtInterchange)}</b>
                      <span className="mins">{mins(transferResult.json.firstArrivalAtInterchange) == null ? '' : t('minutes', mins(transferResult.json.firstArrivalAtInterchange))}</span>
                    </div>
                    {transferResult.json.boardDeparture ? (
                      <div className="muted mt-2">{t('boardAt')}：{clk(transferResult.json.boardDeparture)}</div>
                    ) : null}
                  </div>
                ) : null}
                <h3 className="font-bold mt-4">{t('combinedList')}</h3>
                {(transferResult.json.list || []).length
                  ? transferResult.json.list.map((x, i) => {
                    const dest = loc(x.dest);
                    return (
                      <div className="item" key={`${x.kind}-${x.route}-${x.eta}-${i}`}>
                        <span className="badge">{kindLabel(x.kind)}</span> <b>{x.route}</b>
                        {dest ? <div>{t('towards')}{lang === 'zh' ? '' : ' '}{dest}</div> : null}
                        <div>{loc(x.from)} → {loc(x.to)}</div>
                        <div className="eta">
                          <b>{clk(x.eta)}</b>
                          <span className="mins">{t('minutes', mins(x.eta))}</span>
                        </div>
                        {x.kind === 'transfer' && x.waitAfterFirstMinutes != null ? (
                          <div className="muted">{t('waitAfter', x.waitAfterFirstMinutes)}</div>
                        ) : null}
                        {x.discount ? (
                          <div className="muted"><span className="badge">{t('octopusDiscount')}</span> {lang === 'zh' ? x.discount.notes_zh : x.discount.notes_en} {t('discountNote')}</div>
                        ) : null}
                      </div>
                    );
                  })
                  : <p className="muted">{transferEmpty}</p>}
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
                      state: journeyState,
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
            }}>
              {lineEntries.map(([k, v]) => <option key={k} value={k}>{lineName(v)}</option>)}
            </select>
          </label>
          <label className="block mt-3">
            <span>{t('mtrStationLabel')}</span>
            <select className="field mt-1" value={currentSta} onChange={(e) => setMtrStation(e.target.value)}>
              {currentStations.map((row) => <option key={row[0]} value={row[0]}>{stationLabel(row)}</option>)}
            </select>
          </label>
          <button className="btn mt-4" type="button" aria-label={t('mtrFind')} onClick={() => showMtr()}>{t('mtrFind')}</button>
          <div>
            {mtrResult ? (
              <>
                {mtrResult.delayed ? <div className="note">{t('mtrDelayed')}</div> : null}
                {(mtrResult.trains || []).length
                  ? mtrResult.trains.map((x, i) => {
                    const wait = x.minutes != null ? x.minutes : mins(x.time);
                    const when = x.time ? clk(x.time) : '';
                    const plat = x.platform ? t('platform', x.platform) : '';
                    return (
                      <div className="item eta" key={`${loc(x.dest)}-${x.time}-${i}`}>
                        <div>
                          <b>{t('towards')}{lang === 'zh' ? '' : ' '}{loc(x.dest)}</b>
                          {when || plat ? <div className="muted">{[when, plat].filter(Boolean).join(' · ')}</div> : null}
                        </div>
                        <span className="mins">{wait == null ? '' : t('minutes', wait)}</span>
                      </div>
                    );
                  })
                  : <p className="muted">{t(mtrResult.emptyReason === 'unavailable' ? 'mtrUnavailable' : mtrResult.emptyReason === 'racecourse' ? 'mtrRacecourse' : mtrResult.emptyReason === 'empty' ? 'mtrEmptyLine' : 'noTrains')}</p>}
                <div className="row-actions">
                  <button className="tab" type="button" onClick={() => {
                    const line = lines[currentLineKey];
                    const sta = (line?.stations || []).find((row) => row[0] === currentSta);
                    saveHome({
                      type: 'mtr',
                      title: { zh: `${lineName(line)} · ${sta?.[1]}`, en: `${line?.name.en} · ${sta?.[2]}` },
                      subtitle: { zh: t('nextTrains'), en: 'Next trains' },
                      payload: { line: currentLineKey, station: currentSta }
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
