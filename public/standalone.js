import { I18N } from '/i18n.js';

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const S = { routes: [], stops: [], map: new Map(), cache: new Map(), last: null, lines: {}, lang: localStorage.getItem('tb-lang') || 'zh' };
  let timer;
  let deb;
  let transferSeq = 0;

  const t = (key, ...args) => {
    const value = I18N[S.lang][key];
    return typeof value === 'function' ? value(...args) : value;
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
  const put = (id, html) => { $(id).innerHTML = html; };

  async function api(path, options = {}) {
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
  }

  function applyStatic() {
    document.documentElement.lang = S.lang === 'zh' ? 'zh-Hant' : 'en';
    document.title = t('title');
    $('appTitle').textContent = t('title');
    $('appSubtitle').textContent = t('subtitle');
    $('langBtn').textContent = t('langBtn');
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
    $('stateLabel').textContent = t('stateLabel');
    const state = $('state');
    const stateVal = state.value;
    state.innerHTML = `<option value="wait">${t('wait')}</option><option value="onboard">${t('onboard')}</option>`;
    state.value = stateVal;
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
    $('mtrFind').textContent = t('mtrFind');
    $('homeHeading').textContent = t('homeHeading');
    $('homeHelp').textContent = t('homeHelp');
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
    if (S.last === 't') await go();
    if (S.last === 'm') await mtr();
    await renderHome();
  }

  async function load() {
    put('status', t('loading'));
    try {
      const [routes, stops, lines] = await Promise.all([
        api('/api/kmb/routes'),
        api('/api/kmb/stops'),
        api('/api/mtr/lines')
      ]);
      S.routes = routes.data || [];
      S.stops = stops.data || [];
      S.map = new Map(S.stops.map((x) => [x.stop, x]));
      S.lines = lines.data || {};
      mtrInit();
      put('status', S.routes.length ? t('ready', S.routes.length) : t('loadFail'));
    } catch {
      put('status', t('connectionRefused'));
    }
    renderHome();
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

  function vars(r) {
    const seen = new Set();
    return S.routes.filter((x) => n(x.route) === n(r)).filter((x) => {
      const k = [x.bound, x.service_type, x.orig_en, x.dest_en].join('|');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  async function stops(s) {
    const k = [s.co || 'KMB', s.route, s.bound, s.service_type, s.gmb_route_id || '', s.gmb_route_seq || ''].join('|');
    if (S.cache.has(k)) return S.cache.get(k);
    if (s.co === 'CTB') {
      const d = s.bound === 'I' ? 'inbound' : 'outbound';
      const json = await api(`/api/citybus/route-stop/${encodeURIComponent(s.route)}/${d}`);
      const rows = json.data || [];
      S.cache.set(k, rows);
      return rows;
    }
    if (s.co === 'GMB' && s.gmb_route_id) {
      const json = await api(`/api/gmb/route-stop/${encodeURIComponent(s.gmb_route_id)}/${encodeURIComponent(s.gmb_route_seq || 1)}`);
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
    const join = (arr) => arr.slice(0, 4).join(S.lang === 'zh' ? '、' : ', ') + (arr.length > 4 ? t('more', arr.length - 4) : '');
    if (skipped.length) parts.push(t('skips', join(skipped)));
    if (extra.length) parts.push(t('extras', join(extra)));
    if (!skipped.length && !extra.length) parts.push(t('sameStops'));
    return parts.join(' ');
  }

  async function choices(id, routeStr, pick) {
    let rows = vars(routeStr);
    if (!rows.length) {
      try {
        const json = await api(`/api/gmb/lookup?route=${encodeURIComponent(n(routeStr))}`);
        rows = json.data || [];
      } catch {
        rows = [];
      }
    }
    if (!rows.length) {
      put(id, `<p class="muted">${esc(t('noRoute'))}</p>`);
      return;
    }
    put(id, `<div class="note">${esc(t('checking'))}</div>`);
    const limited = rows.slice(0, 8);
    const info = await Promise.all(limited.map(async (x) => {
      let live = [];
      let seq = [];
      try { live = await routeLive(x); } catch {}
      try { seq = await stops(x); } catch {}
      return { x, live, seq };
    }));
    let keep = info.filter((z) => String(z.x.service_type) === '1' || z.live.length > 0);
    if (!keep.length) keep = info.filter((z) => z.seq.length);
    if (!keep.length) {
      put(id, `<p class="muted">${esc(t('routeUnavailable'))}</p>`);
      return;
    }
    if (keep.length === 1) {
      put(id, '');
      await pick(keep[0].x);
      return;
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
    put(id, keep.map((z, i) => {
      const hasVariants = (byJourney.get([z.x.bound, n(z.x.orig_en), n(z.x.dest_en)].join('|')) || []).length > 1;
      const inactive = z.live.length === 0;
      const note = notes.get(z) || '';
      return `<button class="item choice" data-i="${i}"><b>${esc(z.x.route)}</b><div>${esc(rn(z.x))}</div>${(hasVariants || String(z.x.service_type) !== '1') ? `<div class="muted">${esc(note)}</div>` : ''}${inactive ? `<div class="muted">${esc(t('inactive'))}</div>` : ''}</button>`;
    }).join(''));
    $(id).querySelectorAll('button').forEach((b) => {
      b.onclick = () => pick(keep[+b.dataset.i].x);
    });
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

  function cluster(a) {
    a = [...new Set(a)].sort((x, y) => new Date(x) - new Date(y));
    return a.filter((x, i) => !i || new Date(x) - new Date(a[i - 1]) > 90000);
  }

  function etaList(times) {
    if (!times.length) return `<p class="muted">${esc(t('noEta'))}</p>`;
    return times.map((x) => `<div class="item eta"><b>${esc(clk(x))}</b><span class="mins">${esc(t('minutes', mins(x)))}</span></div>`).join('');
  }

  async function pickA(s) {
    S.a = s;
    S.ag = groups(await stops(s));
    put('arrivalVariants', '');
    put('arrivalStops', `<select id="arrivalStop" class="field mt-3"><option value="">${esc(t('chooseStop'))}</option>${S.ag.map((g, i) => `<option value="${i}">${esc(g.label)}</option>`).join('')}</select>`);
    $('arrivalStop').onchange = showA;
  }

  async function showA() {
    const v = $('arrivalStop').value;
    if (v === '') return;
    const g = S.ag[+v];
    let a = [];
    for (const x of g.stops) a = a.concat(await eta(x.stop, S.a));
    const times = cluster(a.map((x) => x.eta));
    put('arrivalOutput', `<h3 class="font-bold mt-3">${esc(g.label)}</h3>${etaList(times)}<div class="row-actions"><button id="saveArrival" class="tab">${esc(t('saveHome'))}</button></div>`);
    $('saveArrival').onclick = () => saveHome({
      type: 'arrival',
      title: { zh: `${S.a.route}（${areaName(g.stops[0])}）`, en: `${S.a.route} at ${g.stops[0].name_en || g.stops[0].name_tc}` },
      subtitle: { zh: `${S.a.orig_tc || S.a.orig_en} → ${S.a.dest_tc || S.a.dest_en}`, en: `${S.a.orig_en || S.a.orig_tc} → ${S.a.dest_en || S.a.dest_tc}` },
      payload: { service: S.a, stopIndex: +v }
    });
    S.last = 'a';
  }

  async function pickF(s, restore = {}) {
    S.f = s;
    S.fg = groups(await stops(s));
    if (restore.keepBoxHidden === false) $('firstBox').classList.remove('hidden');
    else $('firstBox').classList.add('hidden');
    put('firstVariants', '');
    put('firstSummary', `<div class="note"><b>${esc(s.route)}</b><div>${esc(rn(s))}</div><button id="changeF" class="tab mt-2">${esc(t('change'))}</button></div>`);
    $('changeF').onclick = () => {
      $('firstBox').classList.remove('hidden');
      put('firstSummary', '');
    };
    const o = S.fg.map((g, i) => `<option value="${i}">${esc(g.label)}</option>`).join('');
    const boardLabel = $('state').value === 'wait' ? t('boardStop') : t('boardOptional');
    put('firstStops', `<div class="grid md:grid-cols-2 gap-3 mt-4"><label>${esc(boardLabel)}<select id="board" class="field mt-1"><option value="">${esc(t('notSelected'))}</option>${o}</select></label><label>${esc(t('interchangeStop'))}<select id="interchange" class="field mt-1"><option value="">${esc(t('chooseInterchange'))}</option>${o}</select></label></div>`);
    if (restore.board != null) $('board').value = restore.board;
    if (restore.inter != null) $('interchange').value = restore.inter;
  }

  function dest() {
    const q = $('destinationInput').value.trim().toLowerCase();
    const g = groups(S.stops.filter((x) => q.length > 1 && (
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

  async function go() {
    if (!S.f || !S.d || !$('interchange') || $('interchange').value === '') {
      put('transferOutput', `<div class="note">${esc(t('needFields'))}</div>`);
      return;
    }
    if ($('state').value === 'wait' && $('board') && $('board').value === '') {
      put('transferOutput', `<div class="note">${esc(t('needBoard'))}</div>`);
      return;
    }
    const seq = ++transferSeq;
    put('transferOutput', `<div class="note">${esc(t('searching'))}</div>`);
    try {
      const inter = S.fg[+$('interchange').value];
      const boardVal = $('board').value;
      const json = await api('/api/transfer', {
        method: 'POST',
        body: JSON.stringify({
          state: $('state').value,
          nearby: $('nearby').checked,
          radius: +$('radius').value,
          first: S.f,
          boardStops: boardVal === '' ? [] : stopIds(S.fg[+boardVal]),
          interchangeStops: stopIds(inter),
          destinationStops: stopIds(S.d)
        })
      });
      if (seq !== transferSeq) return;
      const empty = json.emptyReason && !json.list?.length
        ? `<p class="muted">${esc(t(json.emptyReason === 'no_first_bus' ? 'noFirstBus' : json.emptyReason === 'no_connection' ? 'noConnection' : json.emptyReason === 'timeout' ? 'timeout' : json.emptyReason === 'incomplete' ? 'incomplete' : json.emptyReason === 'need_board' ? 'needBoard' : 'none'))}</p>`
        : '';
      const arrivalNote = json.firstArrivalAtInterchange
        ? `<div class="note"><h3 class="font-bold">${esc(t('firstArrival'))}</h3><div class="eta mt-2"><b>${esc(clk(json.firstArrivalAtInterchange))}</b><span class="mins">${esc(t('minutes', mins(json.firstArrivalAtInterchange)))}</span></div>${json.boardDeparture ? `<div class="muted mt-2">${esc(t('boardAt'))}：${esc(clk(json.boardDeparture))}</div>` : ''}</div>`
        : '';
      const rows = (json.list || []).map((x) => {
        const dest = loc(x.dest);
        const disc = x.discount ? `<div class="muted"><span class="badge">${esc(t('octopusDiscount'))}</span> ${esc(S.lang === 'zh' ? x.discount.notes_zh : x.discount.notes_en)} ${esc(t('discountNote'))}</div>` : '';
        return `<div class="item"><span class="badge">${esc(kindLabel(x.kind))}</span> <b>${esc(x.route)}</b>${dest ? `<div>${esc(t('towards'))}${S.lang === 'zh' ? '' : ' '}${esc(dest)}</div>` : ''}<div>${esc(loc(x.from))} → ${esc(loc(x.to))}</div><div class="eta"><b>${esc(clk(x.eta))}</b><span class="mins">${esc(t('minutes', mins(x.eta)))}</span></div>${x.kind === 'transfer' && x.waitAfterFirstMinutes != null ? `<div class="muted">${esc(t('waitAfter', x.waitAfterFirstMinutes))}</div>` : ''}${disc}</div>`;
      }).join('');
      put('transferOutput', `${arrivalNote}<h3 class="font-bold mt-4">${esc(t('combinedList'))}</h3>${rows || empty}<div class="row-actions"><button id="saveTransfer" class="tab">${esc(t('saveHome'))}</button></div>`);
      $('saveTransfer').onclick = () => saveHome({
        type: 'transfer',
        title: { zh: `${S.f.route} → ${S.d.label}`, en: `${S.f.route} → ${S.d.label}` },
        subtitle: { zh: `${inter.label} 轉車`, en: `Transfer at ${inter.label}` },
        payload: {
          first: S.f,
          boardIndex: boardVal,
          interchangeIndex: $('interchange').value,
          destLabel: S.d.label,
          destStops: stopIds(S.d),
          state: $('state').value,
          nearby: $('nearby').checked,
          radius: $('radius').value
        }
      });
      S.last = 't';
    } catch (e) {
      if (seq !== transferSeq) return;
      put('transferOutput', `<div class="note">${esc(e.message || t('none'))}</div>`);
    }
  }

  function lineName(line) {
    return loc(line.name) || line.name;
  }

  function stationLabel(row) {
    return S.lang === 'zh' ? row[1] : row[2];
  }

  function mtrInit() {
    const entries = Object.entries(S.lines);
    if (!entries.length) return;
    const currentLine = $('mtrLine').value;
    const currentSta = $('mtrStation').value;
    put('mtrLine', entries.map(([k, v]) => `<option value="${k}">${esc(lineName(v))}</option>`).join(''));
    if (currentLine) $('mtrLine').value = currentLine;
    mtrStations();
    if (currentSta) $('mtrStation').value = currentSta;
    $('mtrLine').onchange = mtrStations;
  }

  function mtrStations() {
    const line = S.lines[$('mtrLine').value];
    if (!line) return;
    put('mtrStation', line.stations.map((row) => `<option value="${row[0]}">${esc(stationLabel(row))}</option>`).join(''));
  }

  async function mtr() {
    const l = $('mtrLine').value;
    const s = $('mtrStation').value;
    try {
      const r = await api(`/api/mtr/schedule?line=${encodeURIComponent(l)}&sta=${encodeURIComponent(s)}`);
      const a = r.trains || [];
      let empty = t('noTrains');
      if (r.emptyReason === 'unavailable') empty = t('mtrUnavailable');
      else if (r.emptyReason === 'racecourse') empty = t('mtrRacecourse');
      else if (r.emptyReason === 'empty') empty = t('mtrEmptyLine');
      const delay = r.delayed ? `<div class="note">${esc(t('mtrDelayed'))}</div>` : '';
      const list = a.length
        ? a.map((x) => {
          const wait = x.minutes != null ? x.minutes : mins(x.time);
          const when = x.time ? clk(x.time) : '';
          const plat = x.platform ? ` · ${t('platform', x.platform)}` : '';
          return `<div class="item eta"><div><b>${esc(t('towards'))}${S.lang === 'zh' ? '' : ' '}${esc(loc(x.dest))}</b>${when ? `<div class="muted">${esc(when)}${esc(plat)}</div>` : ''}</div><span class="mins">${wait == null ? '' : esc(t('minutes', wait))}</span></div>`;
        }).join('')
        : `<p class="muted">${esc(empty)}</p>`;
      put('mtrOutput', delay + list + `<div class="row-actions"><button id="saveMtr" class="tab">${esc(t('saveHome'))}</button></div>`);
      $('saveMtr').onclick = () => saveHome({
        type: 'mtr',
        title: { zh: `${lineName(S.lines[l])} · ${S.lines[l].stations.find((row) => row[0] === s)[1]}`, en: `${S.lines[l].name.en} · ${S.lines[l].stations.find((row) => row[0] === s)[2]}` },
        subtitle: { zh: t('nextTrains'), en: 'Next trains' },
        payload: { line: l, station: s }
      });
      S.last = 'm';
    } catch {
      put('mtrOutput', `<p class="muted">${esc(t('mtrUnavailable'))}</p>`);
    }
  }

  async function saveHome(item) {
    await api('/api/homes', { method: 'POST', body: JSON.stringify(item) });
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
      const json = await api('/api/homes');
      const rows = json.data || [];
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
          await api(`/api/homes/${b.dataset.pin}`, { method: 'PATCH', body: JSON.stringify({ pinned: b.dataset.pinned !== '1' }) });
          renderHome();
        };
      });
      $('homeOutput').querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = async () => {
          await api(`/api/homes/${b.dataset.del}`, { method: 'DELETE' });
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
      await showA();
    } else if (item.type === 'transfer') {
      tabs('transfer');
      $('state').value = item.payload.state || 'wait';
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
      await mtr();
    }
  }

  function tabs(id) {
    document.querySelectorAll('.tab').forEach((x) => {
      if (x.dataset.tab) x.classList.toggle('active', x.dataset.tab === id);
    });
    document.querySelectorAll('.panel').forEach((x) => x.classList.toggle('active', x.id === id));
    if (id === 'home') renderHome();
  }

  function auto() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (S.last === 'a' && $('arrivalStop') && $('arrivalStop').value !== '') showA();
      if (S.last === 't') go();
      if (S.last === 'm') mtr();
    }, +$('refresh').value * 1000);
  }

  $('langBtn').onclick = async () => {
    S.lang = S.lang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('tb-lang', S.lang);
    applyStatic();
    await refreshDynamic();
  };
  $('arrivalFind').onclick = () => choices('arrivalVariants', $('arrivalRoute').value, pickA);
  $('firstFind').onclick = () => choices('firstVariants', $('firstRoute').value, pickF);
  $('destinationFind').onclick = dest;
  $('transferFind').onclick = go;
  $('mtrFind').onclick = mtr;
  $('refresh').onchange = auto;
  $('state').onchange = () => {
    if (S.f) pickF(S.f, { board: $('board')?.value, inter: $('interchange')?.value, keepBoxHidden: $('firstBox').classList.contains('hidden') });
  };
  if ('serviceWorker' in navigator && (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  $('arrivalRoute').oninput = () => { clearTimeout(deb); deb = setTimeout(() => $('arrivalFind').click(), 500); };
  $('firstRoute').oninput = () => { clearTimeout(deb); deb = setTimeout(() => $('firstFind').click(), 500); };
  $('destinationInput').oninput = () => { clearTimeout(deb); deb = setTimeout(dest, 500); };
  document.querySelectorAll('.tab').forEach((x) => {
    if (x.dataset.tab) x.onclick = () => tabs(x.dataset.tab);
  });
  applyStatic();
  auto();
  load();
})();
