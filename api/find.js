// Vercel 서버리스 함수: 버스 번호로 노선 ID 검색
// 예) /api/find?q=M4108  →  routeId 목록 반환
// ROUTES 배열에 넣을 routeId 를 찾는 용도입니다.

function pickRoutes(data) {
  const header = data?.response?.msgHeader || null;
  const list = data?.response?.msgBody?.busRouteList || [];
  const routes = (Array.isArray(list) ? list : [list]).map(x => ({
    routeId: x.routeId,
    routeName: x.routeName,
    region: x.regionName,
    type: x.routeTypeName,
  }));
  return { header, routes };
}

async function callFind(serviceKeyPart, q) {
  const url = `https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteListv2`
    + `?serviceKey=${serviceKeyPart}`
    + `&keyword=${encodeURIComponent(q)}`
    + `&format=json`;
  const r = await fetch(url);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); }
  catch (e) { return { ok: false, error: 'JSON 아님', raw: text.slice(0, 500) }; }
  return { ok: true, data, text };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { q } = req.query;
  const SERVICE_KEY = (process.env.SERVICE_KEY || '').trim();

  if (!SERVICE_KEY) return res.status(500).json({ error: 'SERVICE_KEY 미설정' });
  if (!q) return res.status(400).json({ error: 'q(버스번호) 파라미터 필요' });

  // Decoding 키면 encode, Encoding 키(% 포함)면 그대로 사용
  const looksEncoded = SERVICE_KEY.includes('%');
  const attempts = looksEncoded
    ? [
        { mode: 'encoding-as-is', part: SERVICE_KEY },
        { mode: 'decoding-encoded', part: encodeURIComponent(SERVICE_KEY) },
      ]
    : [
        { mode: 'decoding-encoded', part: encodeURIComponent(SERVICE_KEY) },
        { mode: 'raw-as-is', part: SERVICE_KEY },
      ];

  try {
    const debug = {
      keyLength: SERVICE_KEY.length,
      looksEncoded,
      tried: [],
    };

    for (const attempt of attempts) {
      const result = await callFind(attempt.part, q);
      debug.tried.push(attempt.mode);

      if (!result.ok) {
        return res.status(502).json({ error: result.error, raw: result.raw, debug });
      }

      const authErr = result.data?.OpenAPI_ServiceResponse?.cmmMsgHeader;
      if (authErr) {
        debug.lastAuthError = authErr;
        continue;
      }

      const { header, routes } = pickRoutes(result.data);
      return res.status(200).json({ query: q, routes, header, debug });
    }

    return res.status(200).json({
      query: q,
      routes: [],
      header: null,
      debug,
      hint: 'SERVICE_KEY가 경기도_버스노선 조회 API에 등록되지 않았거나, Encoding/Decoding 키가 잘못됐을 수 있습니다.',
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
