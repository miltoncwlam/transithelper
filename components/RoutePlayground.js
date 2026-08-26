'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I18N } from '../lib/i18n.js';
import { LINE_COLORS, lineColorForCo } from '../lib/routeColors.js';
import { collectMatchingServices } from '../lib/routeSearch.js';
import StopMap from './StopMap.js';

function n(x) {
  return String(x || '').trim().toUpperCase();
}

function serviceCo(row) {
  if (row?.co) return String(row.co).toUpperCase();
  if (row?.gmb_route_id) return 'GMB';
  if (row?.nlb_route_id) return 'NLB';
  return 'KMB';
}

function loc(row, lang) {
  if (lang === 'zh') return row.dest_tc || row.dest_en || row.orig_tc || '';
  return row.dest_en || row.dest_tc || row.orig_en || '';
}

function rn(row, lang) {
  const orig = lang === 'zh' ? (row.orig_tc || row.orig_en) : (row.orig_en || row.orig_tc);
  const dest = lang === 'zh' ? (row.dest_tc || row.dest_en) : (row.dest_en || row.dest_tc);
  return orig && dest ? `${orig} → ${dest}` : dest || orig || '';
}

function coLabel(row, t) {
  const co = serviceCo(row);
  if (co === 'LWB') return t('coLwb');
  if (co === 'CTB') return t('coCtb');
  if (co === 'GMB') return t('coGmb');
  if (co === 'NLB') return t('coNlb');
  return t('coKmb');
}

function keepSearchResults(list, q, perCo = 4, max = 20) {
  const exact = list.filter((x) => n(x.route) === q);
  const pool = exact.length ? exact : list;
  const byCo = new Map();
  for (const x of pool) {
    const co = serviceCo(x);
    if (!byCo.has(co)) byCo.set(co, []);
    if (byCo.get(co).length < perCo) byCo.get(co).push(x);
  }
  const out = [];
  for (const co of ['KMB', 'LWB', 'CTB', 'NLB', 'GMB', 'JOINT']) {
    out.push(...(byCo.get(co) || []));
    byCo.delete(co);
  }
  for (const rows of byCo.values()) out.push(...rows);
  return out.slice(0, max);
}

async function fetchStops(s) {
  if (serviceCo(s) === 'CTB') {
    const d = s.bound === 'I' ? 'inbound' : 'outbound';
    const json = await fetch(`/api/citybus/route-stop/${encodeURIComponent(s.route)}/${d}`, { cache: 'no-store' }).then((r) => r.json());
    return json.data || [];
  }
  if (serviceCo(s) === 'GMB' && s.gmb_route_id) {
    const json = await fetch(`/api/gmb/route-stop/${encodeURIComponent(s.gmb_route_id)}/${encodeURIComponent(s.gmb_route_seq || 1)}`, { cache: 'no-store' }).then((r) => r.json());
    return json.data || [];
  }
  if (serviceCo(s) === 'NLB' && s.nlb_route_id) {
    const json = await fetch(`/api/nlb/route-stop/${encodeURIComponent(s.nlb_route_id)}`, { cache: 'no-store' }).then((r) => r.json());
    return json.data || [];
  }
  const d = s.bound === 'O' ? 'outbound' : 'inbound';
  const json = await fetch(`/api/kmb/route-stop/${encodeURIComponent(s.route)}/${d}/${s.service_type || 1}`, { cache: 'no-store' }).then((r) => r.json());
  return json.data || [];
}

const LEGEND = [
  { co: 'KMB', key: 'coKmb' },
  { co: 'LWB', key: 'coLwb' },
  { co: 'CTB', key: 'coCtb' },
  { co: 'GMB', key: 'coGmb' },
  { co: 'NLB', key: 'coNlb' }
];

export default function RoutePlayground() {
  const [lang, setLang] = useState('zh');
  const [routes, setRoutes] = useState([]);
  const [query, setQuery] = useState('1');
  const [choices, setChoices] = useState(null);
  const [service, setService] = useState(null);
  const [routeStops, setRouteStops] = useState([]);
  const [line, setLine] = useState(null);
  const [showStraight, setShowStraight] = useState(false);
  const [note, setNote] = useState('');
  const pickSeq = useRef(0);

  const t = useCallback((key, ...args) => {
    const value = (I18N[lang] || I18N.zh)[key];
    return typeof value === 'function' ? value(...args) : value;
  }, [lang]);

  useEffect(() => {
    const saved = localStorage.getItem('tb-lang');
    if (saved === 'en' || saved === 'zh') setLang(saved);
    fetch('/api/kmb/routes', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setRoutes(json.data || []))
      .catch(() => setRoutes([]));
  }, []);

  const sourceLabel = useMemo(() => {
    if (line?.source === 'official') return t('playgroundSourceOfficial');
    if (line?.source === 'osm') return t('playgroundSourceOsm');
    if (line?.source === 'osrm') return t('playgroundSourceRoad');
    if (line?.source === 'straight') return t('playgroundSourceStraight');
    return '';
  }, [line, t]);

  async function pickService(s) {
    const token = ++pickSeq.current;
    setService(s);
    setChoices(null);
    setRouteStops([]);
    setLine({ loading: true, coords: [], source: '', color: lineColorForCo(serviceCo(s)) });
    setNote('');
    try {
      const rows = await fetchStops(s);
      if (token !== pickSeq.current) return;
      const mapped = (rows || []).map((stop, i) => {
        const lat = Number(stop.lat);
        const lng = Number(stop.lng ?? stop.long);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { ...stop, lat, lng, long: lng, seq: i + 1, index: i };
      }).filter(Boolean);
      setRouteStops(mapped);
      const ctrl = new AbortController();
      const kill = setTimeout(() => ctrl.abort(), 10000);
      try {
        const json = await fetch('/api/route-line', {
          method: 'POST',
          cache: 'no-store',
          signal: ctrl.signal,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route: s.route,
            co: serviceCo(s),
            bound: s.bound || '',
            orig: s.orig_tc || s.orig_en || '',
            dest: s.dest_tc || s.dest_en || '',
            td_route_id: s.td_route_id || '',
            stops: mapped.map((stop) => ({ lat: stop.lat, lng: stop.lng }))
          })
        }).then((r) => r.json());
        if (token !== pickSeq.current) return;
        setLine((json.coords || []).length >= 2 ? json : { coords: [], source: json.source || 'straight', color: lineColorForCo(serviceCo(s)) });
      } catch {
        if (token !== pickSeq.current) return;
        setLine({ coords: [], source: 'straight', color: lineColorForCo(serviceCo(s)) });
        setNote(t('routeUnavailable'));
      } finally {
        clearTimeout(kill);
      }
    } catch {
      if (token !== pickSeq.current) return;
      setLine({ coords: [], source: 'straight' });
      setNote(t('routeUnavailable'));
    }
  }

  async function search() {
    pickSeq.current += 1;
    setNote('');
    setService(null);
    setRouteStops([]);
    setLine(null);
    const q = n(query);
    if (!q) return;
    if (!routes.length) {
      setNote(t('loading'));
      return;
    }
    let list = collectMatchingServices(routes, q).filter((x) => serviceCo(x) !== 'GMB' || x.gmb_route_id);
    if (!list.some((x) => n(x.route) === q)) {
      try {
        const json = await fetch(`/api/gmb/lookup?route=${encodeURIComponent(q)}`, { cache: 'no-store' }).then((r) => r.json());
        const extra = json.data || json.routes || [];
        list = extra.concat(list);
      } catch {}
    }
    const keep = keepSearchResults(list, q);
    if (!keep.length) {
      setChoices({ empty: true });
      return;
    }
    if (keep.length === 1) {
      await pickService(keep[0]);
      return;
    }
    setChoices({ keep });
  }

  const accent = line?.color || (service ? lineColorForCo(serviceCo(service)) : LINE_COLORS.KMB);
  const activeCo = service ? serviceCo(service).toLowerCase() : '';

  return (
    <div className="playground-page">
      <div className="pg-stripe" aria-hidden="true" />
    <main className="shell playground-ui">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">HK</span>
          <div>
            <h1 className="text-xl pg-title">{t('playgroundHeading')}</h1>
            <p className="brand-kicker app-tagline">{t('playgroundHelp')}</p>
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
          <Link className="tab pg-back" href="/">{t('playgroundBack')}</Link>
        </div>
      </header>

      <section className="panel active">
        <div className="card">
          <div className="color-legend" aria-hidden="true">
            {LEGEND.map((row) => (
              <span key={row.co} className={`color-chip pg-chip-${row.co.toLowerCase()}`}>
                {t(row.key)}
              </span>
            ))}
          </div>
          <div className="search-row mt-3">
            <input
              className="field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('routePlaceholder')}
              aria-label={t('routePlaceholder')}
              onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            />
            <button className="btn pg-find" type="button" onClick={search} disabled={!routes.length}>{t('find')}</button>
          </div>
          {!routes.length ? <p className="muted mt-3">{t('loading')}</p> : null}
          {note && !service ? <p className="muted mt-3">{note}</p> : null}
          {choices?.empty ? <p className="muted mt-3">{t('noRoute')}</p> : null}
          {choices?.keep ? (
            <div className="mt-3">
              {choices.keep.map((s) => (
                <button
                  key={`${serviceCo(s)}-${s.route}-${s.bound}-${s.gmb_route_id || s.nlb_route_id || s.service_type || ''}`}
                  className={`item choice pg-choice pg-co-${serviceCo(s).toLowerCase()}`}
                  type="button"
                  onClick={() => pickService(s)}
                >
                  <span className="badge">{coLabel(s, t)}</span> <b>{s.route}</b>
                  <div className="muted">{rn(s, lang) || loc(s, lang)}</div>
                </button>
              ))}
            </div>
          ) : null}

          {service ? (
            <>
              <h3 className={`font-bold mt-3 pg-route pg-co-${activeCo}`}>
                <span className="badge">{coLabel(service, t)}</span> {service.route}
              </h3>
              <div className="muted">{rn(service, lang)}</div>
              {line?.loading ? <div className="note">{t('playgroundLoading')}</div> : null}
              {sourceLabel ? <p className="muted mt-2 pg-source">{sourceLabel}{line?.name ? ` · ${line.name}` : ''}</p> : null}
              <label className="muted mt-2 playground-toggle">
                <input type="checkbox" checked={showStraight} onChange={(e) => setShowStraight(e.target.checked)} />
                {t('playgroundShowStraight')}
              </label>
              {routeStops.length >= 2 ? (
                <StopMap
                  className="playground-map"
                  mode="route"
                  center={[routeStops[0].lat, routeStops[0].lng]}
                  routeStops={routeStops}
                  path={line?.coords}
                  lineColor={accent}
                  markerColor={accent}
                  showStraight={showStraight}
                />
              ) : null}
              {note ? <p className="muted mt-2">{note}</p> : null}
            </>
          ) : null}
        </div>
      </section>
    </main>
    </div>
  );
}
