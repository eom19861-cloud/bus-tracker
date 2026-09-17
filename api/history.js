import { getHistoryStore, historyKey, storeReady } from './_lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  if (!storeReady()) {
    return res.status(503).json({
      error: '서버 저장소(Blob)가 연결되지 않았습니다.',
      arrivals: [],
    });
  }

  const stationId = req.query.stationId;
  const routeId = req.query.routeId;
  if (!stationId || !routeId) {
    return res.status(400).json({ error: 'stationId, routeId가 필요합니다.', arrivals: [] });
  }

  try {
    const store = await getHistoryStore();
    const entry = store[historyKey(stationId, routeId)] || null;
    return res.status(200).json({
      stationId: String(stationId),
      routeId: String(routeId),
      routeName: entry?.routeName || null,
      stationName: entry?.stationName || null,
      arrivals: entry?.arrivals || [],
      count: entry?.arrivals?.length || 0,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err), arrivals: [] });
  }
}
