import { LRT_LINE } from './lightrail.js';

export const MTR_LINES = {
  AEL: {
    name: { zh: '機場快綫', en: 'Airport Express' },
    stations: [
      ['HOK', '香港', 'Hong Kong'],
      ['KOW', '九龍', 'Kowloon'],
      ['TSY', '青衣', 'Tsing Yi'],
      ['AIR', '機場', 'Airport'],
      ['AWE', '博覽館', 'AsiaWorld-Expo']
    ]
  },
  TCL: {
    name: { zh: '東涌綫', en: 'Tung Chung line' },
    stations: [
      ['HOK', '香港', 'Hong Kong'],
      ['KOW', '九龍', 'Kowloon'],
      ['OLY', '奧運', 'Olympic'],
      ['NAC', '南昌', 'Nam Cheong'],
      ['LAK', '荔景', 'Lai King'],
      ['TSY', '青衣', 'Tsing Yi'],
      ['SUN', '欣澳', 'Sunny Bay'],
      ['TUC', '東涌', 'Tung Chung']
    ]
  },
  TML: {
    name: { zh: '屯馬綫', en: 'Tuen Ma line' },
    stations: [
      ['WKS', '烏溪沙', 'Wu Kai Sha'],
      ['MOS', '馬鞍山', 'Ma On Shan'],
      ['HEO', '恆安', 'Heng On'],
      ['TSH', '大水坑', 'Tai Shui Hang'],
      ['SHM', '石門', 'Shek Mun'],
      ['CIO', '第一城', 'City One'],
      ['STW', '沙田圍', 'Sha Tin Wai'],
      ['CKT', '車公廟', 'Che Kung Temple'],
      ['TAW', '大圍', 'Tai Wai'],
      ['HIK', '顯徑', 'Hin Keng'],
      ['DIH', '鑽石山', 'Diamond Hill'],
      ['KAT', '啟德', 'Kai Tak'],
      ['SUW', '宋皇臺', 'Sung Wong Toi'],
      ['TKW', '土瓜灣', 'To Kwa Wan'],
      ['HOM', '何文田', 'Ho Man Tin'],
      ['HUH', '紅磡', 'Hung Hom'],
      ['ETS', '尖東', 'East Tsim Sha Tsui'],
      ['AUS', '柯士甸', 'Austin'],
      ['NAC', '南昌', 'Nam Cheong'],
      ['MEF', '美孚', 'Mei Foo'],
      ['TWW', '荃灣西', 'Tsuen Wan West'],
      ['KSR', '錦上路', 'Kam Sheung Road'],
      ['YUL', '元朗', 'Yuen Long'],
      ['LOP', '朗屏', 'Long Ping'],
      ['TIS', '天水圍', 'Tin Shui Wai'],
      ['SIH', '兆康', 'Siu Hong'],
      ['TUM', '屯門', 'Tuen Mun']
    ]
  },
  TKL: {
    name: { zh: '將軍澳綫', en: 'Tseung Kwan O line' },
    stations: [
      ['NOP', '北角', 'North Point'],
      ['QUB', '鰂魚涌', 'Quarry Bay'],
      ['YAT', '油塘', 'Yau Tong'],
      ['TIK', '調景嶺', 'Tiu Keng Leng'],
      ['TKO', '將軍澳', 'Tseung Kwan O'],
      ['LHP', '康城', 'LOHAS Park'],
      ['HAH', '坑口', 'Hang Hau'],
      ['POA', '寶琳', 'Po Lam']
    ]
  },
  EAL: {
    name: { zh: '東鐵綫', en: 'East Rail line' },
    stations: [
      ['LOW', '羅湖', 'Lo Wu'],
      ['LMC', '落馬洲', 'Lok Ma Chau'],
      ['SHS', '上水', 'Sheung Shui'],
      ['FAN', '粉嶺', 'Fanling'],
      ['FOT', '火炭', 'Fo Tan'],
      ['RAC', '馬場', 'Racecourse'],
      ['UNI', '大學', 'University'],
      ['TAP', '大埔墟', 'Tai Po Market'],
      ['TWO', '太和', 'Tai Wo'],
      ['TAW', '大圍', 'Tai Wai'],
      ['KOT', '九龍塘', 'Kowloon Tong'],
      ['SHT', '沙田', 'Sha Tin'],
      ['MKK', '旺角東', 'Mong Kok East'],
      ['HUH', '紅磡', 'Hung Hom'],
      ['EXC', '會展', 'Exhibition Centre'],
      ['ADM', '金鐘', 'Admiralty']
    ]
  },
  SIL: {
    name: { zh: '南港島綫', en: 'South Island line' },
    stations: [
      ['ADM', '金鐘', 'Admiralty'],
      ['OCP', '海洋公園', 'Ocean Park'],
      ['WCH', '黃竹坑', 'Wong Chuk Hang'],
      ['LET', '利東', 'Lei Tung'],
      ['SOH', '海怡半島', 'South Horizons']
    ]
  },
  TWL: {
    name: { zh: '荃灣綫', en: 'Tsuen Wan line' },
    stations: [
      ['CEN', '中環', 'Central'],
      ['ADM', '金鐘', 'Admiralty'],
      ['TST', '尖沙咀', 'Tsim Sha Tsui'],
      ['JOR', '佐敦', 'Jordan'],
      ['YMT', '油麻地', 'Yau Ma Tei'],
      ['MOK', '旺角', 'Mong Kok'],
      ['PRE', '太子', 'Prince Edward'],
      ['SSP', '深水埗', 'Sham Shui Po'],
      ['CSW', '長沙灣', 'Cheung Sha Wan'],
      ['LCK', '荔枝角', 'Lai Chi Kok'],
      ['MEF', '美孚', 'Mei Foo'],
      ['LAK', '荔景', 'Lai King'],
      ['KWF', '葵芳', 'Kwai Fong'],
      ['KWH', '葵興', 'Kwai Hing'],
      ['TWH', '大窩口', 'Tai Wo Hau'],
      ['TSW', '荃灣', 'Tsuen Wan']
    ]
  },
  ISL: {
    name: { zh: '港島綫', en: 'Island line' },
    stations: [
      ['KET', '堅尼地城', 'Kennedy Town'],
      ['HKU', '香港大學', 'HKU'],
      ['SYP', '西營盤', 'Sai Ying Pun'],
      ['SHW', '上環', 'Sheung Wan'],
      ['CEN', '中環', 'Central'],
      ['ADM', '金鐘', 'Admiralty'],
      ['WAC', '灣仔', 'Wan Chai'],
      ['CAB', '銅鑼灣', 'Causeway Bay'],
      ['TIH', '天后', 'Tin Hau'],
      ['FOH', '炮台山', 'Fortress Hill'],
      ['NOP', '北角', 'North Point'],
      ['QUB', '鰂魚涌', 'Quarry Bay'],
      ['TAK', '太古', 'Tai Koo'],
      ['SWH', '西灣河', 'Sai Wan Ho'],
      ['SKW', '筲箕灣', 'Shau Kei Wan'],
      ['HFC', '杏花邨', 'Heng Fa Chuen'],
      ['CHW', '柴灣', 'Chai Wan']
    ]
  },
  KTL: {
    name: { zh: '觀塘綫', en: 'Kwun Tong line' },
    stations: [
      ['WHA', '黃埔', 'Whampoa'],
      ['HOM', '何文田', 'Ho Man Tin'],
      ['YMT', '油麻地', 'Yau Ma Tei'],
      ['MOK', '旺角', 'Mong Kok'],
      ['PRE', '太子', 'Prince Edward'],
      ['SKM', '石硤尾', 'Shek Kip Mei'],
      ['KOT', '九龍塘', 'Kowloon Tong'],
      ['LOF', '樂富', 'Lok Fu'],
      ['WTS', '黃大仙', 'Wong Tai Sin'],
      ['DIH', '鑽石山', 'Diamond Hill'],
      ['CHH', '彩虹', 'Choi Hung'],
      ['KOB', '九龍灣', 'Kowloon Bay'],
      ['NTK', '牛頭角', 'Ngau Tau Kok'],
      ['KWT', '觀塘', 'Kwun Tong'],
      ['LAT', '藍田', 'Lam Tin'],
      ['YAT', '油塘', 'Yau Tong'],
      ['TIK', '調景嶺', 'Tiu Keng Leng']
    ]
  },
  DRL: {
    name: { zh: '迪士尼綫', en: 'Disneyland Resort line' },
    stations: [
      ['SUN', '欣澳', 'Sunny Bay'],
      ['DIS', '迪士尼', 'Disneyland Resort']
    ]
  }
};

const EAL_SOUTH = ['ADM', 'EXC', 'HUH', 'MKK', 'KOT', 'TAW', 'SHT'];
const EAL_NORTH = ['UNI', 'TAP', 'TWO', 'FAN', 'SHS'];

const LINE_ROUTES = {
  TKL: [
    ['NOP', 'QUB', 'YAT', 'TIK', 'TKO', 'HAH', 'POA'],
    ['NOP', 'QUB', 'YAT', 'TIK', 'TKO', 'LHP']
  ],
  EAL: ['FOT', 'RAC'].flatMap((via) => ['LOW', 'LMC'].map((end) => [...EAL_SOUTH, via, ...EAL_NORTH, end]))
};

export function lineRoutes(line) {
  if (line === 'LRT') return [LRT_LINE.stations.map((row) => row[0])];
  if (LINE_ROUTES[line]) return LINE_ROUTES[line];
  const stations = MTR_LINES[line]?.stations;
  return stations ? [stations.map((row) => row[0])] : [];
}

export function publicMtrLines() {
  const out = {};
  for (const [key, line] of Object.entries(MTR_LINES)) {
    out[key] = { ...line, routes: lineRoutes(key) };
  }
  return out;
}

function mtrCode(value) {
  return String(value || '').trim().toUpperCase();
}

export function hopsBetween(line, from, to) {
  const a = mtrCode(from);
  const b = mtrCode(to);
  if (!a || !b || a === b) return null;
  let best = Infinity;
  for (const path of lineRoutes(line)) {
    const i = path.indexOf(a);
    const j = path.indexOf(b);
    if (i < 0 || j < 0) continue;
    best = Math.min(best, Math.abs(j - i));
  }
  return Number.isFinite(best) ? best : null;
}

export function trainServes(line, origin, dest, trainDest) {
  return !!pathBetween(line, origin, dest, trainDest);
}

export function pathBetween(line, origin, dest, trainDest) {
  const oCode = mtrCode(origin);
  const dCode = mtrCode(dest);
  const tCode = mtrCode(trainDest);
  for (const path of lineRoutes(line)) {
    const o = path.indexOf(oCode);
    const d = path.indexOf(dCode);
    const t = path.indexOf(tCode);
    if (o < 0 || d < 0 || t < 0 || o === d) continue;
    if (o < d && d <= t) return path.slice(o, d + 1);
    if (o > d && d >= t) return path.slice(d, o + 1).reverse();
  }
  return null;
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

function slotsForDest(trains, destCode) {
  const dest = mtrCode(destCode);
  return (trains || [])
    .filter((train) => mtrCode(train.destCode) === dest)
    .map((train) => ({ ms: trainMs(train), time: train.time }))
    .filter((slot) => Number.isFinite(slot.ms))
    .sort((a, b) => a.ms - b.ms)
    .map((slot, i) => ({ ...slot, slot: i + 1 }));
}

function followStation(code, ms, estimated) {
  return {
    stop: code,
    name: stationName(code),
    time: new Date(ms).toISOString(),
    estimated: !!estimated
  };
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
  const stops = [followStation(path[0], prevMs, false)];
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
    stops.push(followStation(path[i], prevMs, hopEstimated));
  }
  return { time: new Date(prevMs).toISOString(), estimated, stops };
}

function trainMs(train) {
  if (train?.time) {
    const ms = new Date(train.time).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  if (train?.minutes != null) return Date.now() + train.minutes * 60000;
  return null;
}

export function pickFollowedTrain(trains, board) {
  const dest = mtrCode(board?.destCode);
  const line = board?.line;
  const start = trainMs(board);
  const rows = (trains || []).filter((row) => !dest || mtrCode(row.destCode) === dest);
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

export function stationName(code) {
  const key = mtrCode(code);
  for (const line of Object.values(MTR_LINES)) {
    const hit = line.stations.find((row) => row[0] === key);
    if (hit) return { zh: hit[1], en: hit[2] };
  }
  return { zh: key || '車站', en: key || 'Station' };
}

export function parseMtrTime(time) {
  if (!time || time === '-') return null;
  const raw = String(time).trim();
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const stamped = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}+08:00`;
  const date = new Date(stamped);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeMtrSchedule(payload, line, sta) {
  const delayed = payload?.isdelay === 'Y';
  const apiStatus = Number(payload?.status);
  const block = payload?.data?.[`${line}-${sta}`] || payload?.data?.[`${String(line).toUpperCase()}-${String(sta).toUpperCase()}`] || {};
  const rows = [];
  for (const dir of ['UP', 'DOWN']) {
    for (const train of block[dir] || []) {
      if (!train || train.valid === 'N') continue;
      rows.push({ train, dir });
    }
  }
  const trains = rows.map(({ train }) => {
    const iso = parseMtrTime(train.time);
    const ttnt = Number(train.ttnt);
    const minutes = Number.isFinite(ttnt)
      ? Math.max(0, Math.round(ttnt))
      : (iso ? Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 60000)) : null);
    return {
      dest: stationName(train.dest),
      destCode: mtrCode(train.dest),
      time: iso,
      minutes,
      platform: train.plat && train.plat !== '-' ? String(train.plat) : null,
      line
    };
  }).filter((train) => train.minutes != null || train.time)
    .sort((a, b) => (a.minutes ?? 99) - (b.minutes ?? 99));

  let emptyReason = null;
  if (apiStatus === 0) emptyReason = 'unavailable';
  else if (!trains.length) emptyReason = sta === 'RAC' ? 'racecourse' : 'empty';

  return {
    trains,
    delayed,
    emptyReason,
    message: payload?.message && payload.message !== 'successful' ? payload.message : null
  };
}

export function linesServing(origin, dest) {
  return Object.keys(MTR_LINES).filter((line) => hopsBetween(line, origin, dest) != null);
}

function terminusPlan(base, line, sta, destName) {
  const trains = (base.trains || [])
    .filter((train) => mtrCode(train.destCode) === mtrCode(sta))
    .map((board) => ({
      ...board,
      arrive: board.time,
      arriveMinutes: board.minutes,
      rideMinutes: 0,
      arrivalEstimated: false,
      terminus: true,
      stops: [{
        stop: mtrCode(sta),
        name: stationName(sta),
        time: board.time || null,
        estimated: false
      }]
    }));
  return {
    ...base,
    line,
    trains,
    emptyReason: trains.length ? null : (base.emptyReason === 'unavailable' ? 'unavailable' : 'no_dest'),
    dest: destName
  };
}

async function planOneMtrLine(line, sta, dest, fetchLine) {
  const destName = stationName(dest);
  const originPayload = await fetchLine(line, sta);
  const base = normalizeMtrSchedule(originPayload, line, sta);
  if (mtrCode(sta) && mtrCode(sta) === mtrCode(dest)) {
    return terminusPlan(base, line, sta, destName);
  }
  const hops = hopsBetween(line, sta, dest);
  if (hops == null) {
    return { ...base, line, trains: [], emptyReason: base.emptyReason === 'unavailable' ? 'unavailable' : 'no_dest', dest: destName };
  }
  const serving = base.trains.filter((train) => trainServes(line, sta, dest, train.destCode));
  if (!serving.length) {
    return {
      ...base,
      line,
      trains: [],
      emptyReason: base.emptyReason === 'unavailable' ? 'unavailable' : (base.emptyReason || 'no_dest'),
      dest: destName
    };
  }
  const paths = serving.map((board) => pathBetween(line, sta, dest, board.destCode)).filter(Boolean);
  const codes = [...new Set(paths.flat())];
  await Promise.all(codes.map((code) => fetchLine(line, code).catch(() => null)));
  const tables = {};
  for (const code of codes) {
    try {
      const payload = await fetchLine(line, code);
      if (payload?.isdelay === 'Y') base.delayed = true;
      tables[code] = normalizeMtrSchedule(payload, line, code).trains;
    } catch {
      tables[code] = [];
    }
  }
  const trains = serving.map((board) => {
    const path = pathBetween(line, sta, dest, board.destCode);
    const boardMs = trainMs(board);
    const followed = followTrainAlongPath(path, tables, board.destCode, boardMs, line);
    if (!followed.time) return null;
    const arriveMs = new Date(followed.time).getTime();
    return {
      ...board,
      arrive: followed.time,
      arriveMinutes: Math.max(0, Math.ceil((arriveMs - Date.now()) / 60000)),
      rideMinutes: Number.isFinite(boardMs) ? Math.max(1, Math.round((arriveMs - boardMs) / 60000)) : null,
      arrivalEstimated: followed.estimated,
      stops: followed.stops || []
    };
  }).filter(Boolean);
  return { ...base, line, trains, emptyReason: trains.length ? null : (base.emptyReason || 'empty'), dest: destName };
}

export async function planMtrRide(line, sta, dest, opts = {}) {
  const keys = opts.sameLine ? [line] : [...new Set([line, ...linesServing(sta, dest)])];
  const memo = new Map();
  const fetchLine = (ln, stop) => {
    const key = `${ln}:${stop}`;
    if (!memo.has(key)) memo.set(key, fetchMtrSchedule(ln, stop));
    return memo.get(key);
  };
  const parts = await Promise.all(keys.map((key) => planOneMtrLine(key, sta, dest, fetchLine)));
  const destName = stationName(dest);
  const trains = parts
    .flatMap((part) => (part.trains || []).map((train) => ({
      ...train,
      line: part.line,
      lineName: MTR_LINES[part.line]?.name || { zh: part.line, en: part.line }
    })))
    .sort((a, b) => (trainMs({ time: a.arrive }) ?? trainMs(a) ?? 0) - (trainMs({ time: b.arrive }) ?? trainMs(b) ?? 0));
  const delayed = parts.some((part) => part.delayed);
  const unavailable = parts.every((part) => part.emptyReason === 'unavailable');
  let emptyReason = null;
  if (!trains.length) {
    if (unavailable) emptyReason = 'unavailable';
    else if (parts.every((part) => part.emptyReason === 'no_dest' || part.emptyReason === 'unavailable')) emptyReason = 'no_dest';
    else if (sta === 'RAC') emptyReason = 'racecourse';
    else emptyReason = parts.find((part) => part.emptyReason)?.emptyReason || 'empty';
  }
  return {
    trains,
    delayed,
    emptyReason,
    dest: destName,
    message: parts.find((part) => part.message)?.message || null
  };
}

export async function fetchMtrSchedule(line, sta) {
  const url = `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${encodeURIComponent(line)}&sta=${encodeURIComponent(sta)}`;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TransitBuddy/1.0'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw new Error('MTR schedule unavailable');
      return await res.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
