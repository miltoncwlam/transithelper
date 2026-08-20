export function stopIdOf(stop) {
  if (stop && typeof stop === 'object') return String(stop.stop || '');
  return String(stop || '');
}

export function stopNameMissing(stop) {
  const id = stopIdOf(stop);
  const tc = String(stop?.name_tc || stop?.zh || '').trim();
  const en = String(stop?.name_en || stop?.en || '').trim();
  if (!tc && !en) return true;
  if (id && tc === id && (!en || en === id)) return true;
  return false;
}

export function displayStopPair(stop) {
  if (!stop || stopNameMissing(stop)) return { zh: '車站', en: 'Stop' };
  return {
    zh: stop.name_tc || stop.zh || stop.name_en || stop.en,
    en: stop.name_en || stop.en || stop.name_tc || stop.zh
  };
}

export function displayStopName(stop, lang) {
  const pair = displayStopPair(stop);
  return lang === 'zh' ? pair.zh : pair.en;
}

export function lookupStopMap(stopMap, id, co) {
  if (!stopMap) return null;
  const sid = String(id || '');
  if (!sid) return null;
  if (co) {
    const keyed = stopMap.get(`${String(co).toUpperCase()}:${sid}`);
    if (keyed) return keyed;
  }
  return stopMap.get(sid)
    || stopMap.get(`CTB:${sid}`)
    || stopMap.get(`KMB:${sid}`)
    || stopMap.get(`GMB:${sid}`)
    || stopMap.get(`NLB:${sid}`)
    || null;
}
