// Vercel 서버리스 함수: 경기도 버스위치정보 API 프록시
// v2 위치 API는 차량 GPS 없이 stationId만 주는 경우가 있어,
// 같은 노선의 정류소 좌표로 위치를 보정합니다.
//
// 일일 트래픽 절약: 정류소 목록은 메모리 캐시, 위치는 짧은 TTL 캐시.

const stationCache = new Map(); // routeId -> { at, stations }
const locationCache = new Map(); // routeId -> { at, payload }
const STATION_TTL_MS = 6 * 60 * 60 * 1000;
const LOCATION_TTL_MS = 10 * 1000;

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

async function fetchJson(url) {
  const r = await fetch(url);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); }
  catch (e) { return { error: 'JSON 아님', raw: text.slice(0, 500) }; }
  return { data, text };
}

function authHeader(data) {
  return data?.OpenAPI_ServiceResponse?.cmmMsgHeader || null;
}

function isRateLimit(authErr) {
  const code = String(authErr?.returnReasonCode || '');
  const msg = String(authErr?.errMsg || authErr?.returnAuthMsg || '');
  return code === '22' || /LIMITED_NUMBER_OF_SERVICE_REQUESTS/i.test(msg);
}

async function fetchLocation(routeId, keyPart) {
  const locUrl = `https://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2`
    + `?serviceKey=${keyPart}`
    + `&routeId=${encodeURIComponent(routeId)}`
    + `&format=json`;
  return fetchJson(locUrl);
}

async function fetchStations(routeId, keyPart) {
  const cached = stationCache.get(routeId);
  if (cached && Date.now() - cached.at < STATION_TTL_MS) {
    return { stations: cached.stations, fromCache: true };
  }

  const stUrl = `https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteStationListv2`
    + `?serviceKey=${keyPart}`
    + `&routeId=${encodeURIComponent(routeId)}`
    + `&format=json`;
  const stRes = await fetchJson(stUrl);
  if (stRes.error) return { stations: [], fromCache: false, error: stRes.error };

  const authErr = authHeader(stRes.data);
  if (authErr) return { stations: [], fromCache: false, authError: authErr };

  const stationById = {};
  const stationBySeq = {};
  const stList = stRes.data?.response?.msgBody?.busRouteStationList || [];
  for (const s of (Array.isArray(stList) ? stList : [stList])) {
    const lat = parseFloat(s.y);
    const lng = parseFloat(s.x);
    if (isNaN(lat) || isNaN(lng)) continue;
    if (s.stationId != null) stationById[String(s.stationId)] = { lat, lng, name: s.stationName };
    if (s.stationSeq != null) stationBySeq[String(s.stationSeq)] = { lat, lng, name: s.stationName };
  }
  const stations = { stationById, stationBySeq };
  stationCache.set(routeId, { at: Date.now(), stations });
  return { stations, fromCache: false };
}

function buildBuses(busList, stations) {
  const stationById = stations?.stationById || {};
  const stationBySeq = stations?.stationBySeq || {};
  return (Array.isArray(busList) ? busList : [busList]).map(b => {
    let lat = parseFloat(b.gpsY);
    let lng = parseFloat(b.gpsX);
    let stationName = null;
    let hasGps = !isNaN(lat) && !isNaN(lng);

    if (!hasGps) {
      const hit = stationById[String(b.stationId)] || stationBySeq[String(b.stationSeq)];
      if (hit) {
        lat = hit.lat;
        lng = hit.lng;
        stationName = hit.name;
      }
    }

    const stateCd = Number(b.stateCd);
    return {
      plateNo: b.plateNo,
      lat,
      lng,
      hasGps,
      stationSeq: b.stationSeq,
      stationId: b.stationId,
      stationName,
      stateCd: Number.isFinite(stateCd) ? stateCd : null,
      remainSeat: b.remainSeatCnt,
      crowded: b.crowded,
      lowPlate: b.lowPlate,
    };
  }).filter(b => !isNaN(b.lat) && !isNaN(b.lng));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=8, stale-while-revalidate=20');

  const { routeId } = req.query;
  const attempts = keyAttemptsFromEnv();

  if (!attempts.length) {
    return res.status(500).json({ error: 'SERVICE_KEY 환경변수가 설정되지 않았습니다.' });
  }
  if (!routeId) {
    return res.status(400).json({ error: 'routeId 쿼리 파라미터가 필요합니다.' });
  }

  const cachedLoc = locationCache.get(String(routeId));
  if (cachedLoc && Date.now() - cachedLoc.at < LOCATION_TTL_MS) {
    return res.status(200).json({ ...cachedLoc.payload, cached: true });
  }

  try {
    let lastAuthError = null;
    let locRes = null;
    let usedKeyPart = attempts[0].part;

    for (const attempt of attempts) {
      locRes = await fetchLocation(routeId, attempt.part);
      if (locRes.error) {
        return res.status(502).json({ error: locRes.error, raw: locRes.raw });
      }
      const authErr = authHeader(locRes.data);
      if (!authErr) {
        usedKeyPart = attempt.part;
        lastAuthError = null;
        break;
      }
      lastAuthError = authErr;
      if (isRateLimit(authErr)) break;
    }

    if (lastAuthError) {
      const rateLimited = isRateLimit(lastAuthError);
      return res.status(200).json({
        routeId,
        count: 0,
        buses: [],
        authError: lastAuthError,
        rateLimited,
        error: rateLimited
          ? '공공데이터 API 일일 호출 한도를 초과했습니다. 자정 이후 다시 이용하거나, data.go.kr에서 트래픽 증설/운영계정 전환을 신청해 주세요.'
          : (lastAuthError.returnAuthMsg || lastAuthError.errMsg || 'API 인증 오류'),
        hint: rateLimited
          ? '호출을 줄이려면 자동 갱신 간격을 늘리거나, 사용하지 않는 노선을 삭제하세요.'
          : '경기도_버스위치정보 조회 API 활용신청을 확인해 주세요.',
      });
    }

    const st = await fetchStations(routeId, usedKeyPart);
    const header = locRes.data?.response?.msgHeader || null;
    const busList = locRes.data?.response?.msgBody?.busLocationList || [];
    const buses = buildBuses(busList, st.stations);

    const payload = {
      routeId,
      count: buses.length,
      buses,
      header,
      positionSource: buses.some(b => b.hasGps) ? 'gps' : 'station+state',
      stationCache: st.fromCache,
    };
    locationCache.set(String(routeId), { at: Date.now(), payload });
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
