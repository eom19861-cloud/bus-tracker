import { getWatchlist, setWatchlist, storeReady } from './_lib/store.js';

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
      return res.status(200).json(watchlist);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const stations = (Array.isArray(body.stations) ? body.stations : [])
        .filter((s) => s && s.stationId)
        .map((s) => ({
          stationId: String(s.stationId),
          name: String(s.name || '정류장'),
          role: s.role === 'work' ? 'work' : (s.role === 'home' ? 'home' : 'watch'),
          lat: s.lat != null ? Number(s.lat) : null,
          lng: s.lng != null ? Number(s.lng) : null,
        }));
      const routeIds = (Array.isArray(body.routeIds) ? body.routeIds : []).map(String).filter(Boolean);
      const saved = await setWatchlist({ stations, routeIds });
      return res.status(200).json({ ok: true, ...saved });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
