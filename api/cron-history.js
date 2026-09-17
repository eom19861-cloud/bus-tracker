import { fetchStationArrivalsServer } from './_lib/gyeonggi.js';
import {
  getWatchlist,
  getHistoryStore,
  setHistoryStore,
  getApproachStore,
  setApproachStore,
  recordArrival,
  storeReady,
} from './_lib/store.js';

function authorized(req) {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) {
    return req.headers['x-vercel-cron'] === '1';
  }
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${secret}`) return true;
  if (req.query?.secret === secret) return true;
  if (req.headers['x-vercel-cron'] === '1') return true;
  return false;
}

function observe(stationId, stationName, arrivals, approach, history) {
  const now = Date.now();
  const seen = new Set();

  for (const a of arrivals || []) {
    const candidates = [
      { plate: a.plateNo1, eta: a.etaSec1 },
      { plate: a.plateNo2, eta: a.etaSec2 },
    ];
    for (const c of candidates) {
      if (!c.plate || c.eta == null || !Number.isFinite(c.eta) || c.eta > 180) continue;
      const key = `${stationId}|${a.routeId}|${c.plate}`;
      seen.add(key);
      const prev = approach[key];
      if (!prev) {
        approach[key] = {
          stationId: String(stationId),
          routeId: String(a.routeId),
          routeName: a.routeName || a.routeId,
          stationName: stationName || '',
          plate: c.plate,
          minEta: c.eta,
          lastTs: now,
        };
      } else {
        prev.minEta = Math.min(prev.minEta, c.eta);
        prev.lastTs = now;
        prev.routeName = a.routeName || prev.routeName;
        prev.stationName = stationName || prev.stationName;
      }
    }
  }

  for (const [key, prev] of Object.entries(approach)) {
    if (!key.startsWith(`${stationId}|`)) continue;
    if (seen.has(key)) continue;
    if (prev.minEta <= 150) {
      const arrivedAt = prev.lastTs + Math.min(prev.minEta, 45) * 1000;
      recordArrival(history, {
        stationId: prev.stationId,
        routeId: prev.routeId,
        routeName: prev.routeName,
        stationName: prev.stationName,
        atMs: arrivedAt,
      });
    }
    delete approach[key];
  }

  for (const [key, prev] of Object.entries(approach)) {
    if (now - prev.lastTs > 12 * 60 * 1000) delete approach[key];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!storeReady()) {
    return res.status(503).json({ error: 'Blob store not configured' });
  }

  try {
    const watchlist = await getWatchlist();
    const stations = Array.isArray(watchlist.stations) ? watchlist.stations : [];
    const routeIdSet = new Set((watchlist.routeIds || []).map(String).filter(Boolean));

    if (!stations.length) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'watchlist empty — 집/회사 즐겨찾기를 앱에서 한 번 저장하세요.',
      });
    }

    const approach = await getApproachStore();
    const history = await getHistoryStore();
    const results = [];

    for (const st of stations) {
      const { arrivals, error, rateLimited } = await fetchStationArrivalsServer(
        st.stationId,
        routeIdSet.size ? routeIdSet : null
      );
      if (error) {
        results.push({ stationId: st.stationId, error, rateLimited: !!rateLimited });
        if (rateLimited) break;
        continue;
      }
      observe(st.stationId, st.name, arrivals, approach, history);
      results.push({ stationId: st.stationId, arrivals: arrivals.length });
    }

    await setApproachStore(approach);
    await setHistoryStore(history);

    return res.status(200).json({
      ok: true,
      stations: results,
      historyKeys: Object.keys(history).length,
      approachKeys: Object.keys(approach).length,
      at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
