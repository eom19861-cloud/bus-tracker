export const TYPE_SHORT = {
  11: '직좌',
  12: '좌석',
  13: '일반',
  14: '광역',
  15: '따복',
  16: '순환',
  21: '직좌',
  22: '좌석',
  23: '일반',
  30: '마을',
  41: '시외',
  42: '시외',
  43: '시외',
  51: '공항',
  52: '공항',
  53: '공항',
};

const SPEED_KMH = {
  11: 34,
  12: 28,
  13: 22,
  14: 40,
  15: 24,
  16: 36,
  21: 32,
  22: 26,
  23: 20,
  30: 18,
  41: 50,
  42: 42,
  43: 38,
  51: 48,
  52: 42,
  53: 36,
};

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function parseHHMM(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  let h;
  let m;
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const parts = s.split(':');
    h = Number(parts[0]);
    m = Number(parts[1]);
  } else if (/^\d{3,4}$/.test(s)) {
    const n = s.padStart(4, '0');
    h = Number(n.slice(0, 2));
    m = Number(n.slice(2));
  } else {
    return null;
  }
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 30 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

export function formatHHMM(totalMin) {
  if (!Number.isFinite(totalMin)) return '';
  let min = ((totalMin % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function asList(value) {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function haversineMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateTravelMin(stations, fromIdx, toIdx, routeTypeCd) {
  if (!stations?.length || fromIdx == null || toIdx == null) return 0;
  if (toIdx <= fromIdx) return 0;
  let meters = 0;
  for (let i = fromIdx + 1; i <= toIdx; i += 1) {
    const prev = stations[i - 1];
    const cur = stations[i];
    if (prev?.lat == null || cur?.lat == null) continue;
    meters += haversineMeters(prev, cur);
  }
  const kmh = SPEED_KMH[Number(routeTypeCd)] || 28;
  const driveMin = ((meters / 1000) / kmh) * 60;
  const dwellMin = Math.max(0, (toIdx - fromIdx) * 0.28);
  return Math.max(0, Math.round(driveMin + dwellMin));
}

export function isPeakHour(day, minutes) {
  const hour = Math.floor(minutes / 60) % 24;
  if (day === 0) return false;
  if (day === 6) return hour >= 11 && hour < 18;
  return (hour >= 7 && hour < 9) || (hour >= 17 && hour < 20);
}

export function generateDayTimes(firstMin, lastMin, peekAlloc, nPeekAlloc, day) {
  if (!Number.isFinite(firstMin) || !Number.isFinite(lastMin)) return [];
  let peek = num(peekAlloc);
  let npeek = num(nPeekAlloc);
  if (!peek && npeek) peek = npeek;
  if (!npeek && peek) npeek = Math.max(peek, Math.round(peek * 1.6));
  if (!peek) peek = 15;
  if (!npeek) npeek = 20;

  let last = lastMin;
  if (last < firstMin) last += 24 * 60;

  const times = [];
  let t = firstMin;
  let guard = 0;
  while (t <= last && guard < 400) {
    times.push(t);
    const interval = Math.max(1, isPeakHour(day, t) ? peek : npeek);
    t += interval;
    guard += 1;
  }
  return times;
}

export function pickDirectionSchedule(info, day, goingDown) {
  const dir = goingDown ? 'Down' : 'Up';
  const dirLow = goingDown ? 'down' : 'up';
  const weekday = {
    first: info[`${dirLow}FirstTime`],
    last: info[`${dirLow}LastTime`],
    peek: num(info.peekAlloc),
    npeek: num(info.nPeekAlloc),
  };
  if (day === 0) {
    return {
      first: info[`sun${dir}FirstTime`] || info[`we${dir}FirstTime`] || weekday.first,
      last: info[`sun${dir}LastTime`] || info[`we${dir}LastTime`] || weekday.last,
      peek: num(info.sunPeekAlloc) || num(info.wePeekAlloc) || weekday.peek,
      npeek: num(info.sunNPeekAlloc) || num(info.weNPeekAlloc) || weekday.npeek,
    };
  }
  if (day === 6) {
    return {
      first: info[`sat${dir}FirstTime`] || weekday.first,
      last: info[`sat${dir}LastTime`] || weekday.last,
      peek: num(info.satPeekAlloc) || weekday.peek,
      npeek: num(info.satNPeekAlloc) || weekday.npeek,
    };
  }
  return weekday;
}

export function kstParts(date = new Date()) {
  const raw = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);
  const pick = (type) => raw.find((p) => p.type === type)?.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = Number(pick('hour'));
  if (hour === 24) hour = 0;
  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    hour,
    minute: Number(pick('minute')),
    dow: weekdayMap[pick('weekday')] ?? 0,
  };
}

function utcMsFromKst(year, month, day) {
  return Date.parse(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00+09:00`);
}

export function dateNWeeksAgo(dow, weekAgo, now = new Date()) {
  const kst = kstParts(now);
  const todayMs = utcMsFromKst(kst.year, kst.month, kst.day);
  const thisWeekMs = todayMs - (kst.dow - dow) * 86400000;
  const targetMs = thisWeekMs - weekAgo * 7 * 86400000;
  const p = kstParts(new Date(targetMs));
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    dow,
    iso: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
    label: `${p.month}.${p.day}.(${DOW_KO[dow]})`,
    weekAgo,
  };
}

export function typeShort(routeTypeCd, routeTypeName = '') {
  return TYPE_SHORT[Number(routeTypeCd)] || String(routeTypeName).slice(0, 2) || '버스';
}

export function buildTimesForStation(info, stations, stationId, day) {
  const list = (stations || []).map((s, idx) => ({
    ...s,
    stationId: s.stationId != null ? String(s.stationId) : '',
    seq: Number(s.seq ?? s.stationSeq ?? idx + 1),
    turnYn: String(s.turnYn || '').toUpperCase(),
    lat: Number(s.lat ?? s.y),
    lng: Number(s.lng ?? s.x),
    name: s.name || s.stationName || '',
  })).sort((a, b) => a.seq - b.seq);
  list.forEach((s, idx) => { s.idx = idx; });

  const here = list.find((s) => s.stationId === String(stationId));
  if (!here) {
    return { error: '이 노선이 해당 정류장을 지나지 않습니다.', times: [], travelMin: 0 };
  }

  const turn = list.find((s) => s.turnYn === 'Y')
    || (info.turnStID != null ? list.find((s) => s.stationId === String(info.turnStID)) : null);
  const goingDown = turn ? here.seq > turn.seq : false;
  const origin = goingDown ? turn : list[0];
  const originIdx = origin?.idx ?? 0;
  const hereIdx = here.idx;
  const travelMin = estimateTravelMin(list, originIdx, hereIdx, info.routeTypeCd);
  const sched = pickDirectionSchedule(info, day, goingDown);
  const first = parseHHMM(sched.first);
  const last = parseHHMM(sched.last);
  const originTimes = generateDayTimes(first, last, sched.peek, sched.npeek, day);
  const lastIdx = originTimes.length - 1;
  const times = originTimes.map((min, i) => {
    const arrived = min + travelMin;
    return {
      min: arrived,
      hhmm: formatHHMM(arrived),
      last: i === lastIdx,
      predicted: true,
    };
  });

  const next = list.find((s) => s.seq > here.seq) || null;
  return {
    times,
    travelMin,
    goingDown,
    nextStationName: next?.name || next?.stationName || null,
    destName: goingDown
      ? (info.startStationName || null)
      : (info.endStationName || info.turnStNm || null),
    mobileNo: here.mobileNo != null ? String(here.mobileNo) : null,
    stationName: here.name || here.stationName || null,
    peekAlloc: sched.peek,
    nPeekAlloc: sched.npeek,
    firstTime: formatHHMM(first + travelMin),
    lastTime: formatHHMM(last + travelMin),
  };
}

export function hoursFromTimes(times) {
  const hours = [];
  for (const t of times || []) {
    const h = Math.floor(t.min / 60) % 24;
    if (!hours.includes(h)) hours.push(h);
  }
  return hours;
}

export function timesFromHour(times, hour) {
  const start = hour * 60;
  const end = start + 120;
  return (times || []).filter((t) => {
    const m = t.min % (24 * 60);
    return m >= start && m < end;
  });
}
