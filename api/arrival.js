// 정류소별 버스 도착정보 프록시
// 경기도_버스도착정보 조회: getBusArrivalListv2
// query: stationId (필수), routeIds=id1,id2 (선택 — 설정된 노선만 필터)

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

function formatEta(item, which) {
  const flag = item.flag;
  if (flag === 'STOP') return '운행종료';
  if (flag === 'WAIT' && which === 1) return '회차지 대기';

  const secRaw = item[`predictTimeSec${which}`];
  const minRaw = item[`predictTime${which}`];
  const sec = Number(secRaw);
  const min = Number(minRaw);

  if (Number.isFinite(sec) && sec >= 0) {
    if (sec <= 30) return '곧 도착';
    if (sec < 60) return `${sec}초 후`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}분 ${s}초 후` : `${m}분 후`;
  }
  if (Number.isFinite(min) && min >= 0) {
    if (min === 0) return '곧 도착';
    return `${min}분 후`;
  }
  return null;
}

function etaSeconds(item, which) {
  const sec = Number(item[`predictTimeSec${which}`]);
  if (Number.isFinite(sec) && sec >= 0) return sec;
  const min = Number(item[`predictTime${which}`]);
  if (Number.isFinite(min) && min >= 0) return min * 60;
  return null;
}

function normalizeItem(raw) {
  const routeId = String(raw.routeId ?? '');
  const eta1 = formatEta(raw, 1);
  const eta2 = formatEta(raw, 2);
  const seat1 = Number(raw.remainSeatCnt1);
  const seat2 = Number(raw.remainSeatCnt2);
  return {
    routeId,
    routeName: raw.routeName || routeId,
    flag: raw.flag || null,
    eta1,
    eta2,
    etaSec1: etaSeconds(raw, 1),
    etaSec2: etaSeconds(raw, 2),
    remainSeat1: Number.isFinite(seat1) ? seat1 : null,
    remainSeat2: Number.isFinite(seat2) ? seat2 : null,
    plateNo1: raw.plateNo1 || null,
    plateNo2: raw.plateNo2 || null,
    locationNo1: raw.locationNo1 ?? null,
    locationNo2: raw.locationNo2 ?? null,
  };
}

async function fetchArrival(stationId, keyPart) {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=8, stale-while-revalidate=20');

  const stationId = req.query.stationId;
  const routeIdsRaw = req.query.routeIds || '';
  const routeIdSet = new Set(
    String(routeIdsRaw)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );

  const attempts = keyAttemptsFromEnv();
  if (!attempts.length) {
    return res.status(500).json({ error: 'SERVICE_KEY 환경변수가 설정되지 않았습니다.' });
  }
  if (!stationId) {
    return res.status(400).json({ error: 'stationId 쿼리 파라미터가 필요합니다.' });
  }

  try {
    let lastAuthError = null;
    let data = null;

    for (const attempt of attempts) {
      const result = await fetchArrival(stationId, attempt.part);
      if (result.error) {
        return res.status(502).json({ error: result.error, raw: result.raw });
      }
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
      const rateLimited = isRateLimit(lastAuthError);
      return res.status(200).json({
        stationId,
        arrivals: [],
        authError: lastAuthError,
        rateLimited,
        error: rateLimited
          ? '공공데이터 API 일일 호출 한도를 초과했습니다.'
          : (lastAuthError.returnAuthMsg || lastAuthError.errMsg || 'API 인증 오류'),
        hint: rateLimited
          ? null
          : 'data.go.kr에서 「경기도_버스도착정보 조회」 활용신청이 필요할 수 있습니다.',
      });
    }

    const list = data?.response?.msgBody?.busArrivalList || [];
    const items = (Array.isArray(list) ? list : [list])
      .filter(Boolean)
      .map(normalizeItem)
      .filter(item => !routeIdSet.size || routeIdSet.has(item.routeId));

    // 설정된 노선 순서 우선, 없으면 도착 빠른 순
    items.sort((a, b) => {
      const aSec = a.eta1?.includes('곧') ? 0 : 9999;
      const bSec = b.eta1?.includes('곧') ? 0 : 9999;
      return String(a.routeName).localeCompare(String(b.routeName), 'ko');
    });

    return res.status(200).json({
      stationId,
      count: items.length,
      arrivals: items,
      header: data?.response?.msgHeader || null,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
