// Shared Gyeonggi arrival fetch helpers for serverless collectors

export function keyAttemptsFromEnv() {
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

function etaSeconds(item, which) {
  const sec = Number(item[`predictTimeSec${which}`]);
  if (Number.isFinite(sec) && sec >= 0) return sec;
  const min = Number(item[`predictTime${which}`]);
  if (Number.isFinite(min) && min >= 0) return min * 60;
  return null;
}

function normalizeItem(raw) {
  return {
    routeId: String(raw.routeId ?? ''),
    routeName: raw.routeName || String(raw.routeId ?? ''),
    flag: raw.flag || null,
    etaSec1: etaSeconds(raw, 1),
    etaSec2: etaSeconds(raw, 2),
    plateNo1: raw.plateNo1 || null,
    plateNo2: raw.plateNo2 || null,
  };
}

async function fetchArrivalRaw(stationId, keyPart) {
  const url = `https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2`
    + `?serviceKey=${keyPart}`
    + `&stationId=${encodeURIComponent(stationId)}`
    + `&format=json`;
  const r = await fetch(url);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); }
  catch { return { error: 'JSON 아님', raw: text.slice(0, 500) }; }
  return { data };
}

export async function fetchStationArrivalsServer(stationId, routeIdSet = null) {
  const attempts = keyAttemptsFromEnv();
  if (!attempts.length) {
    return { arrivals: [], error: 'SERVICE_KEY 없음' };
  }

  let lastAuthError = null;
  let data = null;
  for (const attempt of attempts) {
    const result = await fetchArrivalRaw(stationId, attempt.part);
    if (result.error) return { arrivals: [], error: result.error };
    const authErr = authHeader(result.data);
    if (!authErr) {
      data = result.data;
      lastAuthError = null;
      break;
    }
    lastAuthError = authErr;
    if (isRateLimit(authErr)) break;
  }

  if (lastAuthError) {
    return {
      arrivals: [],
      error: lastAuthError.returnAuthMsg || lastAuthError.errMsg || 'API 인증 오류',
      rateLimited: isRateLimit(lastAuthError),
    };
  }

  const list = data?.response?.msgBody?.busArrivalList || [];
  const items = (Array.isArray(list) ? list : [list])
    .filter(Boolean)
    .map(normalizeItem)
    .filter((item) => !routeIdSet?.size || routeIdSet.has(item.routeId));

  return { arrivals: items };
}
