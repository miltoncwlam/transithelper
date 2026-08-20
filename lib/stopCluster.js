function metresBetween(a, b) {
  const lat1 = Number(a.lat);
  const lng1 = Number(a.long ?? a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.long ?? b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  return Math.hypot((lat1 - lat2) * 111000, (lng1 - lng2) * 102000);
}

function nameKey(stop) {
  return String(stop?.name_tc || stop?.name_en || '')
    .normalize('NFKC')
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/[\s–—_.,'"-]+/g, '')
    .toLowerCase();
}

function commonName(members, field) {
  const counts = new Map();
  for (const row of members) {
    const value = String(row[field] || '').trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best = '';
  let n = 0;
  for (const [value, count] of counts) {
    if (count > n) {
      best = value;
      n = count;
    }
  }
  return best;
}

export function clusterOppositeStops(stops, metres = 40) {
  const list = (stops || []).filter((stop) => (
    Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.long ?? stop.lng))
  ));
  const used = new Set();
  const clusters = [];
  for (let i = 0; i < list.length; i += 1) {
    if (used.has(i)) continue;
    const members = [list[i]];
    used.add(i);
    const key = nameKey(list[i]);
    for (let j = i + 1; j < list.length; j += 1) {
      if (used.has(j)) continue;
      const dist = metresBetween(list[i], list[j]);
      const same = key && key === nameKey(list[j]);
      if (dist <= metres || (same && dist <= 55)) {
        members.push(list[j]);
        used.add(j);
      }
    }
    const lat = members.reduce((sum, row) => sum + Number(row.lat), 0) / members.length;
    const lng = members.reduce((sum, row) => sum + Number(row.long ?? row.lng), 0) / members.length;
    clusters.push({
      lat,
      lng,
      name_tc: commonName(members, 'name_tc') || members[0].name_tc,
      name_en: commonName(members, 'name_en') || members[0].name_en,
      metres: Math.round(Math.min(...members.map((row) => Number(row.metres) || 0))),
      co: members[0].co,
      stop: members[0].stop,
      members
    });
  }
  return clusters.sort((a, b) => (a.metres || 0) - (b.metres || 0));
}
