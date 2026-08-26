/** MTR Light Rail Next Train. Station ids from the official data dictionary. */
const BASE = 'https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule';

export const LRT_STATIONS = [
  [1, '屯門碼頭', 'Tuen Mun Ferry Pier'],
  [10, '美樂', 'Melody Garden'],
  [15, '蝴蝶', 'Butterfly'],
  [20, '輕鐵車廠', 'Light Rail Depot'],
  [30, '龍門', 'Lung Mun'],
  [40, '青山村', 'Tsing Shan Tsuen'],
  [50, '青雲', 'Tsing Wun'],
  [60, '建安', 'Kin On'],
  [70, '河田', 'Ho Tin'],
  [75, '蔡意橋', 'Choy Yee Bridge'],
  [80, '澤豐', 'Affluence'],
  [90, '屯門醫院', 'Tuen Mun Hospital'],
  [100, '兆康', 'Siu Hong'],
  [110, '麒麟', 'Kei Lun'],
  [120, '青松', 'Ching Chung'],
  [130, '建生', 'Kin Sang'],
  [140, '田景', 'Tin King'],
  [150, '良景', 'Leung King'],
  [160, '新圍', 'San Wai'],
  [170, '石排', 'Shek Pai'],
  [180, '山景 (北)', 'Shan King (North)'],
  [190, '山景 (南)', 'Shan King (South)'],
  [200, '鳴琴', 'Ming Kum'],
  [212, '大興 (北)', 'Tai Hing (North)'],
  [220, '大興 (南)', 'Tai Hing (South)'],
  [230, '銀圍', 'Ngan Wai'],
  [240, '兆禧', 'Siu Hei'],
  [250, '海皇路', 'Hoi Wong Road'],
  [260, '豐景園', 'Goodview Garden'],
  [265, '兆麟', 'Siu Lun'],
  [270, '安定', 'On Ting'],
  [275, '友愛', 'Yau Oi'],
  [280, '市中心', 'Town Centre'],
  [295, '屯門', 'Tuen Mun'],
  [300, '杯渡', 'Pui To'],
  [310, '何福堂', 'Hoh Fuk Tong'],
  [320, '新墟', 'San Hui'],
  [330, '景峰', 'Prime View'],
  [340, '鳳地', 'Fung Tei'],
  [350, '藍地', 'Lam Tei'],
  [360, '泥圍', 'Nai Wai'],
  [370, '鍾屋村', 'Chung Uk Tsuen'],
  [380, '洪水橋', 'Hung Shui Kiu'],
  [390, '塘坊村', 'Tong Fong Tsuen'],
  [400, '屏山', 'Ping Shan'],
  [425, '坑尾村', 'Hang Mei Tsuen'],
  [430, '天水圍', 'Tin Shui Wai'],
  [435, '天慈', 'Tin Tsz'],
  [445, '天耀', 'Tin Yiu'],
  [448, '樂湖', 'Locwood'],
  [450, '天湖', 'Tin Wu'],
  [455, '銀座', 'Ginza'],
  [460, '天瑞', 'Tin Shui'],
  [468, '頌富', 'Chung Fu'],
  [480, '天富', 'Tin Fu'],
  [490, '翠湖', 'Chestwood'],
  [500, '天榮', 'Tin Wing'],
  [510, '天悅', 'Tin Yuet'],
  [520, '天秀', 'Tin Sau'],
  [530, '濕地公園', 'Wetland Park'],
  [540, '天恒', 'Tin Heng'],
  [550, '天逸', 'Tin Yat'],
  [560, '水邊圍', 'Shui Pin Wai'],
  [570, '豐年路', 'Fung Nin Road'],
  [580, '康樂路', 'Hong Lok Road'],
  [590, '大棠路', 'Tai Tong Road'],
  [600, '元朗', 'Yuen Long'],
  [920, '三聖', 'Sam Shing']
];

const LRT_TERMINUS_IDS = [1, 100, 140, 275, 430, 550, 600, 920];
export const LRT_TERMINI = LRT_STATIONS
  .filter((row) => LRT_TERMINUS_IDS.includes(row[0]))
  .map((row) => [String(row[0]), row[1], row[2]]);

export const LRT_LINE = {
  name: { zh: '輕鐵', en: 'Light Rail' },
  stations: LRT_STATIONS.map((row) => [String(row[0]), row[1], row[2]])
};

function parseLrtMinutes(train) {
  const ch = String(train.time_ch || '');
  const en = String(train.time_en || '');
  if (/即將到站|arriving/i.test(ch + en)) return 0;
  if (/正在離開|departing/i.test(ch + en)) return 0;
  const m = /(\d+)/.exec(ch) || /(\d+)/.exec(en);
  if (!m) return null;
  return Number(m[1]);
}

function lrtStationRow(id) {
  const code = String(id || '').trim();
  if (!code) return null;
  return LRT_STATIONS.find((row) => String(row[0]) === code) || null;
}

function lrtSystemMs(payload) {
  const raw = String(payload?.system_time || '').trim();
  if (!raw) return Date.now();
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const stamped = /Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}+08:00`;
  const ms = Date.parse(stamped);
  return Number.isFinite(ms) ? ms : Date.now();
}

function terminusMatches(dest, destRow, destWanted) {
  if (destRow) return dest.zh === destRow[1] || dest.en === destRow[2];
  const wanted = String(destWanted || '').trim();
  if (!wanted) return true;
  return dest.zh === wanted || dest.en.toLowerCase() === wanted.toLowerCase();
}

export function normalizeLrtSchedule(payload, stationId, destFilter) {
  const status = Number(payload?.status);
  const destRow = lrtStationRow(destFilter);
  const sameStop = destRow && String(destRow[0]) === String(stationId);
  const destWanted = sameStop ? '' : String(destFilter || '').trim();
  const systemMs = lrtSystemMs(payload);
  const all = [];
  for (const platform of payload?.platform_list || []) {
    for (const train of platform.route_list || []) {
      if (!train || Number(train.stop) === 1) continue;
      const dest = {
        zh: train.dest_ch || train.dest_en || '',
        en: train.dest_en || train.dest_ch || ''
      };
      const minutes = parseLrtMinutes(train);
      if (minutes == null && !/即將|arriving|離開|departing/i.test(String(train.time_ch || '') + String(train.time_en || ''))) continue;
      const wait = minutes == null ? 0 : minutes;
      all.push({
        line: 'LRT',
        lineName: LRT_LINE.name,
        route: train.route_no,
        dest,
        destCode: destWanted || '',
        minutes: wait,
        time: new Date(systemMs + wait * 60000).toISOString(),
        timeText: { zh: train.time_ch || '', en: train.time_en || train.time_ch || '' },
        platform: platform.platform_id != null ? String(platform.platform_id) : null,
        special: Number(train.special) === 1,
        cars: Number(train.train_length) || null
      });
    }
  }
  all.sort((a, b) => (a.minutes ?? 99) - (b.minutes ?? 99) || String(a.route).localeCompare(String(b.route)));
  const matching = destWanted ? all.filter((train) => terminusMatches(train.dest, destRow, destWanted)) : all;
  const destRelaxed = !!(destWanted && all.length && !matching.length);
  const trains = destRelaxed ? all : matching;
  let emptyReason = null;
  if (status === 0) emptyReason = 'unavailable';
  else if (!trains.length) emptyReason = destWanted && !destRelaxed ? 'no_dest' : 'empty';
  return {
    trains,
    delayed: false,
    emptyReason,
    dest: destRow && destWanted ? { zh: destRow[1], en: destRow[2] } : null,
    destRelaxed,
    message: null
  };
}

export async function fetchLrtSchedule(stationId) {
  const url = `${BASE}?station_id=${encodeURIComponent(stationId)}&with_special=1`;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json', 'User-Agent': 'TransitBuddy/1.0' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw new Error('Light Rail schedule unavailable');
      return await res.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function planLrt(stationId, dest) {
  try {
    const payload = await fetchLrtSchedule(stationId);
    return normalizeLrtSchedule(payload, stationId, dest);
  } catch {
    return {
      trains: [],
      delayed: false,
      emptyReason: 'unavailable',
      dest: null,
      destRelaxed: false,
      message: null
    };
  }
}
