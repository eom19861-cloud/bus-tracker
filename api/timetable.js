// 정류장 과거/예상 시간표 프록시
// 경기버스 노선 배차(첫차·막차·배차간격)와 정류소 순서로 도착 시각을 재구성합니다.
// 주차별 실측은 브라우저에 쌓인 도착 기록을 화면에서 합칩니다.

import {
  asList,
  buildTimesForStation,
  dateNWeeksAgo,
  hoursFromTimes,
  kstParts,
  typeShort,
} from '../lib/timetable.mjs';

const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function keyAttemptsFromEnv() {
  const key = (process.env.SERVICE_KEY || '').trim();
  if (!key) return [];
  const looksEncoded = key.includes('%');
  return looksEncoded
    ? [
        { mode: 'encoding-as-is', part: key },
        { mode: 'decoding-encoded', part: encodeURIComponent(key) },
      ]
    : [
        { mode: 'decoding-encoded', part: encodeURIComponent(key) },
        { mode: 'raw-as-is', part: key },
      ];
}

function authHeader(data) {
  return data?.OpenAPI_ServiceResponse?.cmmMsgHeader || null;
}

function isRateLimit(authErr) {
  const code = String(authErr?.returnReasonCode || '');
  const msg = String(authErr?.errMsg || authErr?.returnAuthMsg || '');
  return code === '22' || /LIMITED_NUMBER_OF_SERVICE_REQUESTS/i.test(msg);
}

async function fetchJson(url) {
  const r = await fetch(url);
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'JSON 아님', raw: text.slice(0, 500) };
  }
  return { data };
}

async function cachedFetch(cacheKey, url, attempts) {
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.value, cached: true };

  let lastAuthError = null;
  let lastError = null;
  for (const attempt of attempts) {
    const resolved = url(attempt.part);
    const result = await fetchJson(resolved);
    if (result.error) {
      lastError = result;
      continue;
    }
    const authErr = authHeader(result.data);
    if (authErr) {
      lastAuthError = authErr;
      if (isRateLimit(authErr)) break;
      continue;
    }
    const value = { data: result.data };
    cache.set(cacheKey, { at: Date.now(), value });
    return value;
  }
  if (lastAuthError) return { authError: lastAuthError };
  return lastError || { error: '조회 실패' };
}

function gbis(path, keyPart, extra) {
  return `https://apis.data.go.kr/6410000/${path}?serviceKey=${keyPart}&format=json&${extra}`;
}

function normalizeStationInfo(data) {
  const item = data?.response?.msgBody?.busStationInfo;
  if (!item) return null;
  return {
    stationId: item.stationId != null ? String(item.stationId) : null,
    name: item.stationName || null,
    mobileNo: item.mobileNo != null ? String(item.mobileNo).padStart(5, '0') : null,
    regionName: item.regionName || null,
  };
}

function normalizeViaRoutes(data) {
  const list = asList(data?.response?.msgBody?.busRouteList);
  return list.map((r) => ({
    routeId: r.routeId != null ? String(r.routeId) : '',
    routeName: r.routeName || '',
    routeTypeCd: Number(r.routeTypeCd) || null,
    routeTypeName: r.routeTypeName || '',
    typeShort: typeShort(r.routeTypeCd, r.routeTypeName),
    destName: r.routeDestName || null,
    staOrder: r.staOrder != null ? Number(r.staOrder) : null,
  })).filter((r) => r.routeId);
}

function normalizeRouteInfo(data) {
  const item = data?.response?.msgBody?.busRouteInfoItem;
  return item || null;
}

function normalizeStations(data) {
  return asList(data?.response?.msgBody?.busRouteStationList).map((s) => ({
    stationId: s.stationId != null ? String(s.stationId) : '',
    name: s.stationName || '',
    seq: Number(s.stationSeq),
    mobileNo: s.mobileNo != null ? String(s.mobileNo) : null,
    turnYn: s.turnYn || 'N',
    lat: parseFloat(s.y),
    lng: parseFloat(s.x),
  })).filter((s) => s.stationId);
}

function authPayload(stationId, lastAuthError) {
  const rateLimited = isRateLimit(lastAuthError);
  return {
    stationId,
    error: rateLimited
      ? '공공데이터 API 일일 호출 한도를 초과했습니다.'
      : (lastAuthError.returnAuthMsg || lastAuthError.errMsg || 'API 인증 오류'),
    rateLimited,
    authError: lastAuthError,
    hint: rateLimited
      ? null
      : 'data.go.kr에서 「경기도_버스노선 조회」 활용신청을 확인해 주세요.',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');

  const stationId = req.query.stationId ? String(req.query.stationId) : '';
  const routeId = req.query.routeId ? String(req.query.routeId) : '';
  const preferRouteIds = String(req.query.preferRouteIds || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const attempts = keyAttemptsFromEnv();
  if (!attempts.length) {
    return res.status(500).json({ error: 'SERVICE_KEY 환경변수가 설정되지 않았습니다.' });
  }
  if (!stationId) {
    return res.status(400).json({ error: 'stationId 쿼리 파라미터가 필요합니다.' });
  }

  try {
    const stationRes = await cachedFetch(
      `station:${stationId}`,
      (key) => gbis('busstationservice/v2/busStationInfov2', key, `stationId=${encodeURIComponent(stationId)}`),
      attempts,
    );
    const viaRes = await cachedFetch(
      `via:${stationId}`,
      (key) => gbis(
        'busstationservice/v2/getBusStationViaRouteListv2',
        key,
        `stationId=${encodeURIComponent(stationId)}`,
      ),
      attempts,
    );

    const station = stationRes.data ? normalizeStationInfo(stationRes.data) : {
      stationId,
      name: null,
      mobileNo: null,
      regionName: null,
    };
    let routes = viaRes.data ? normalizeViaRoutes(viaRes.data) : [];

    if (preferRouteIds.length) {
      routes.sort((a, b) => {
        const ai = preferRouteIds.indexOf(a.routeId);
        const bi = preferRouteIds.indexOf(b.routeId);
        if (ai === -1 && bi === -1) return String(a.routeName).localeCompare(String(b.routeName), 'ko');
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }

    const selectedRouteId = routeId
      || routes.find((r) => preferRouteIds.includes(r.routeId))?.routeId
      || routes[0]?.routeId
      || preferRouteIds[0]
      || '';

    if (!selectedRouteId) {
      return res.status(200).json({
        station,
        routes,
        selectedRouteId: '',
        error: viaRes.authError
          ? authPayload(stationId, viaRes.authError).error
          : '이 정류장을 지나는 노선을 찾지 못했습니다. 지도에서 노선을 추가한 뒤 다시 열어 주세요.',
        rateLimited: viaRes.authError ? isRateLimit(viaRes.authError) : false,
      });
    }

    const infoRes = await cachedFetch(
      `info:${selectedRouteId}`,
      (key) => gbis(
        'busrouteservice/v2/getBusRouteInfoItemv2',
        key,
        `routeId=${encodeURIComponent(selectedRouteId)}`,
      ),
      attempts,
    );
    if (infoRes.authError) {
      return res.status(200).json(authPayload(stationId, infoRes.authError));
    }
    if (infoRes.error) {
      return res.status(502).json({ error: infoRes.error, raw: infoRes.raw });
    }

    const stRes = await cachedFetch(
      `stops:${selectedRouteId}`,
      (key) => gbis(
        'busrouteservice/v2/getBusRouteStationListv2',
        key,
        `routeId=${encodeURIComponent(selectedRouteId)}`,
      ),
      attempts,
    );
    if (stRes.authError) {
      return res.status(200).json(authPayload(stationId, stRes.authError));
    }

    const info = normalizeRouteInfo(infoRes.data);
    const stations = stRes.data ? normalizeStations(stRes.data) : [];
    if (!info) {
      return res.status(200).json({
        station,
        routes,
        selectedRouteId,
        error: '노선 배차정보를 찾지 못했습니다.',
      });
    }

    if (!routes.some((r) => r.routeId === selectedRouteId)) {
      routes = [
        {
          routeId: selectedRouteId,
          routeName: info.routeName || selectedRouteId,
          routeTypeCd: Number(info.routeTypeCd) || null,
          routeTypeName: info.routeTypeName || '',
          typeShort: typeShort(info.routeTypeCd, info.routeTypeName),
          destName: info.endStationName || null,
          staOrder: null,
        },
        ...routes,
      ];
    }

    const selected = routes.find((r) => r.routeId === selectedRouteId) || routes[0];
    const byDay = {};
    let builtMeta = null;
    for (let day = 0; day < 7; day += 1) {
      const built = buildTimesForStation(info, stations, stationId, day);
      builtMeta = built;
      byDay[day] = {
        times: built.times || [],
        hours: hoursFromTimes(built.times || []),
        travelMin: built.travelMin || 0,
        firstTime: built.firstTime || null,
        lastTime: built.lastTime || null,
        peekAlloc: built.peekAlloc || null,
        nPeekAlloc: built.nPeekAlloc || null,
        error: built.error || null,
      };
      if (built.mobileNo && !station.mobileNo) station.mobileNo = String(built.mobileNo).padStart(5, '0');
      if (built.stationName && !station.name) station.name = built.stationName;
    }
    station.direction = builtMeta?.nextStationName || selected.destName || builtMeta?.destName || null;

    const now = kstParts();
    const weekDates = {};
    for (let day = 0; day < 7; day += 1) {
      weekDates[day] = [1, 2, 3].map((weekAgo) => dateNWeeksAgo(day, weekAgo));
    }

    return res.status(200).json({
      station,
      routes,
      selectedRouteId,
      selectedRoute: selected,
      byDay,
      weekDates,
      now: { hour: now.hour, minute: now.minute, dow: now.dow },
      source: 'gbis-schedule',
      note: '경기버스 배차정보로 만든 예상 시간표입니다. 앱을 켜 두면 실제 도착 시각이 주차별 칸에 쌓입니다.',
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
