// 경기도 노선 정류소 + path 반환
// pathMode:
//   official (기본) — 경기버스 공식 노선형상정보 (getBusRouteLineListv2)
//   smooth — 정류소 순서 유지 곡선
//   roads  — Map Matching 도로 스냅
//   raw    — 정류소 직선

function keyPartFromEnv() {
  const key = (process.env.SERVICE_KEY || '').trim();
  if (!key) return null;
  return key.includes('%') ? key : encodeURIComponent(key);
}

function dedupeNear(points, minMeters = 15) {
  if (!points.length) return [];
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const dy = (a.lat - b.lat) * 111320;
    const dx = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
    if (Math.hypot(dx, dy) >= minMeters) out.push(b);
  }
  return out;
}

// 정류소 순서를 지키는 Catmull-Rom 보간
function catmullRomPath(points, segmentsPerSpan = 10) {
  const pts = dedupeNear(points, 10);
  if (pts.length < 2) return pts;
  if (pts.length === 2) return pts;

  const padded = [pts[0], ...pts, pts[pts.length - 1]];
  const result = [];

  for (let i = 1; i < padded.length - 2; i++) {
    const p0 = padded[i - 1];
    const p1 = padded[i];
    const p2 = padded[i + 1];
    const p3 = padded[i + 2];

    for (let s = 0; s < segmentsPerSpan; s++) {
      const t = s / segmentsPerSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      const lat = 0.5 * (
        (2 * p1.lat) +
        (-p0.lat + p2.lat) * t +
        (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 +
        (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3
      );
      const lng = 0.5 * (
        (2 * p1.lng) +
        (-p0.lng + p2.lng) * t +
        (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * t2 +
        (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * t3
      );
      result.push({ lat, lng });
    }
  }
  result.push(pts[pts.length - 1]);
  return result;
}

function chunkWaypoints(points, size = 90) {
  const chunks = [];
  if (points.length <= size) return [points];
  for (let i = 0; i < points.length - 1; i += size - 1) {
    chunks.push(points.slice(i, Math.min(i + size, points.length)));
  }
  return chunks;
}

async function mapMatchChunk(points, token) {
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  // radiuses 를 짧게 두면 정류소 근처 도로만 고르려 함
  const radiuses = points.map(() => 35).join(';');
  const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coords}`
    + `?geometries=geojson&overview=full&radiuses=${radiuses}`
    + `&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json();
  const geom = data?.matchings?.[0]?.geometry?.coordinates;
  if (!Array.isArray(geom) || !geom.length) return null;
  return geom.map(([lng, lat]) => ({ lat, lng }));
}

async function buildRoadPath(stations) {
  const points = dedupeNear(stations, 20);
  if (points.length < 2) return { path: points, pathSource: 'stations' };

  const token = (process.env.MAPBOX_TOKEN || '').trim();
  if (!token.startsWith('pk.') && !token.startsWith('sk.')) {
    return { path: catmullRomPath(stations), pathSource: 'smooth-fallback' };
  }

  const chunks = chunkWaypoints(points, 90);
  const merged = [];
  for (let i = 0; i < chunks.length; i++) {
    let part = await mapMatchChunk(chunks[i], token);
    if (!part) part = catmullRomPath(chunks[i]);
    if (i > 0 && part.length) part = part.slice(1);
    merged.push(...part);
  }
  return { path: dedupeNear(merged, 6), pathSource: 'map-matching' };
}

async function fetchOfficialLine(routeId, keyPart) {
  const url = `https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteLineListv2`
    + `?serviceKey=${keyPart}`
    + `&routeId=${encodeURIComponent(routeId)}`
    + `&format=json`;
  const r = await fetch(url);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); }
  catch { return []; }

  if (data?.OpenAPI_ServiceResponse) return [];

  const list = data?.response?.msgBody?.busRouteLineList || [];
  return (Array.isArray(list) ? list : [list]).map(p => ({
    lat: parseFloat(p.y),
    lng: parseFloat(p.x),
    seq: p.lineSeq,
  })).filter(p => !isNaN(p.lat) && !isNaN(p.lng))
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

async function buildPath(stations, mode, routeId, keyPart) {
  if (mode === 'raw') return { path: stations, pathSource: 'stations' };
  if (mode === 'roads') return buildRoadPath(stations);
  if (mode === 'smooth') return { path: catmullRomPath(stations), pathSource: 'smooth' };

  // official (default)
  const official = await fetchOfficialLine(routeId, keyPart);
  if (official.length >= 2) {
    return { path: official, pathSource: 'official-line' };
  }
  return { path: catmullRomPath(stations), pathSource: 'smooth-fallback' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  const { routeId } = req.query;
  const pathMode = String(req.query.pathMode || 'official').toLowerCase();
  const keyPart = keyPartFromEnv();

  if (!keyPart) {
    return res.status(500).json({ error: 'SERVICE_KEY 환경변수가 설정되지 않았습니다.' });
  }
  if (!routeId) {
    return res.status(400).json({ error: 'routeId 쿼리 파라미터가 필요합니다.' });
  }

  const url = `https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteStationListv2`
    + `?serviceKey=${keyPart}`
    + `&routeId=${encodeURIComponent(routeId)}`
    + `&format=json`;

  try {
    const r = await fetch(url);
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: 'API가 JSON이 아닌 응답을 반환했습니다.', raw: text.slice(0, 500) });
    }

    const list = data?.response?.msgBody?.busRouteStationList || [];
    const stations = (Array.isArray(list) ? list : [list]).map(s => ({
      name: s.stationName,
      lat: parseFloat(s.y),
      lng: parseFloat(s.x),
      seq: s.stationSeq,
      stationId: s.stationId != null ? String(s.stationId) : null,
    })).filter(s => !isNaN(s.lat) && !isNaN(s.lng))
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

    const { path, pathSource } = await buildPath(stations, pathMode, routeId, keyPart);

    return res.status(200).json({
      routeId,
      count: stations.length,
      stations,
      path,
      pathCount: path.length,
      pathSource,
      pathMode,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
