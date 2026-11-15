import { getWatchlist, setWatchlist, storeReady } from './_lib/store.js';

function normalizeStations(body) {
  return (Array.isArray(body.stations) ? body.stations : [])
    .filter((s) => s && s.stationId)
    .map((s) => ({
      stationId: String(s.stationId),
      name: String(s.name || '정류장'),
      role: s.role === 'work' ? 'work' : (s.role === 'home' ? 'home' : 'watch'),
      lat: s.lat != null && Number.isFinite(Number(s.lat)) ? Number(s.lat) : null,
      lng: s.lng != null && Number.isFinite(Number(s.lng)) ? Number(s.lng) : null,
    }));
}

function normalizeRouteIds(body) {
  return (Array.isArray(body.routeIds) ? body.routeIds : []).map(String).filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!storeReady()) {
    return res.status(503).json({
      error: '서버 저장소(Blob)가 연결되지 않았습니다.',
      hint: 'Vercel Blob 스토어를 프로젝트에 연결하세요.',
    });
  }

  try {
    if (req.method === 'GET') {
      const watchlist = await getWatchlist();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(watchlist);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const stations = normalizeStations(body);
      const routeIds = normalizeRouteIds(body);

      // 빈 목록으로 서버 watchlist 를 덮어쓰지 않는다.
      // (앱이 localStorage 를 비운 채 로드되면 예전 코드가 서버 즐겨찾기를 지웠다.)
      // 즐겨찾기를 마지막 하나까지 지운 경우에만 앱이 force:true 를 보낸다.
      if (!stations.length && !body.force) {
        const current = await getWatchlist();
        if (current.stations.length) {
          return res.status(200).json({
            ok: true,
            skipped: 'empty-guard',
            reason: '빈 목록은 저장하지 않았습니다(기존 즐겨찾기 유지).',
            ...current,
          });
        }
      }

      const { watchlist: saved, save } = await setWatchlist({ stations, routeIds });
      return res.status(200).json({
        ok: true,
        ...saved,
        saved: save.written,
        saveReason: save.written ? undefined : save.reason,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
