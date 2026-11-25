// 즐겨찾기 정류장의 버스 도착을 주기적으로 관측해 Blob(state.json)에 쌓는다.
//
// Blob 사용량 원칙 (Hobby: Advanced Operations 월 2,000건)
// - 호출 1회당 get 1회(state.json), put 은 "새 도착이 생겼을 때"만 1회.
// - 예전에는 매 호출마다 approach·history 를 각각 put 해서 하루 수천 건을 썼다(90초 주기 × 2회 put).
//   지금은 GitHub Action 이 평일 아침(05:00~07:00 KST)·저녁(16:00~18:00 KST) 창에서 90초 간격으로 호출하고,
//   저장은 변화가 있을 때만 일어난다.
//
// 정류장별 수집 시간대 (집은 아침, 회사는 저녁)
// - 05:00~06:59 KST: role 'home' 정류장만 조회·관측
// - 16:00~17:59 KST: role 'work' 정류장만 조회·관측
// - 그 외 시각: 크론 지연·수동 호출 등으로 왔더라도 정류장 조회 없이 바로 skipped 로 끝낸다.
import { fetchStationArrivalsServer } from './_lib/gyeonggi.js';
import { getState, saveState, recordArrival, storeReady } from './_lib/store.js';
import { collectionRoleAt, kstHour } from '../lib/collection-window.mjs';

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

// 30분 간격 조회에서도 버스를 놓치지 않도록, 20분 안 버스는 바로 기록한다.
const CAPTURE_SEC = 20 * 60;
// 이 시간보다 오래된 approach 항목은 지운다.
const APPROACH_KEEP_MS = 40 * 60 * 1000;

/**
 * 도착 정보를 관측해 approach(진행 중인 버스)와 history(도착 기록)에 반영한다.
 * @returns {{changed: boolean, recorded: number}}
 */
function observe(stationId, stationName, arrivals, approach, history) {
  const now = Date.now();
  let changed = false;
  let recorded = 0;

  for (const a of arrivals || []) {
    if (a.flag === 'STOP') continue;
    const candidates = [
      { plate: a.plateNo1, eta: a.etaSec1 },
      { plate: a.plateNo2, eta: a.etaSec2 },
    ];
    for (const c of candidates) {
      if (!c.plate || c.eta == null || !Number.isFinite(c.eta) || c.eta < 0 || c.eta > CAPTURE_SEC) continue;
      const key = `${stationId}|${a.routeId}|${c.plate}`;
      const prev = approach[key];
      // 더 가까워진 관측이 더 정확하다. 이미 90초 안으로 잠긴 시각은 유지한다.
      const closer = !prev || (!prev.locked && c.eta <= prev.eta + 30);
      const eta = closer ? c.eta : prev.eta;
      const arriveAt = closer ? now + Math.round(c.eta) * 1000 : prev.arriveAt;
      const locked = Boolean(prev?.locked) || c.eta <= 90;
      if (!prev) changed = true;
      else if (!prev.locked && locked) changed = true;
      approach[key] = {
        stationId: String(stationId),
        routeId: String(a.routeId),
        routeName: a.routeName || prev?.routeName || a.routeId,
        stationName: stationName || prev?.stationName || '',
        plate: c.plate,
        eta,
        arriveAt,
        lastTs: now,
        locked,
      };
      const added = recordArrival(history, {
        stationId: String(stationId),
        routeId: String(a.routeId),
        routeName: approach[key].routeName,
        stationName: approach[key].stationName,
        atMs: arriveAt,
      });
      if (added) {
        changed = true;
        recorded += 1;
      }
    }
  }

  for (const [key, prev] of Object.entries(approach)) {
    if (now - prev.lastTs > APPROACH_KEEP_MS) {
      delete approach[key];
      changed = true;
    }
  }

  return { changed, recorded };
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

  // 수집 창(평일 05~07시 / 16~18시 KST) 밖이면 상태를 읽지도, 정류장을 조회하지도 않는다.
  // (지연된 크론이나 수동 호출이 시간외 데이터를 쌓지 않게 한다. Blob get 도 아낀다.)
  const windowRole = collectionRoleAt();
  if (!windowRole) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: 'outside collection window',
      kstHour: kstHour(),
      windows: ['05:00-07:00 KST home', '16:00-18:00 KST work'],
      at: new Date().toISOString(),
    });
  }

  try {
    const state = await getState();
    const stations = Array.isArray(state.watchlist?.stations) ? state.watchlist.stations : [];
    const routeIdSet = new Set((state.watchlist?.routeIds || []).map(String).filter(Boolean));

    if (!stations.length) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'watchlist empty — 앱에서 집/회사 즐겨찾기를 한 번 저장하면 수집이 시작됩니다.',
        at: new Date().toISOString(),
      });
    }

    // 이번 시간대에 해당하는 role 의 정류장만 관측한다.
    const windowStations = stations.filter((s) => s.role === windowRole);
    if (!windowStations.length) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: `no '${windowRole}' station in watchlist`,
        kstHour: kstHour(),
        at: new Date().toISOString(),
      });
    }

    const approach = state.approach || {};
    const history = state.history || {};
    const results = [];
    let changed = false;
    let recorded = 0;

    for (const st of windowStations) {
      const { arrivals, error, rateLimited } = await fetchStationArrivalsServer(
        st.stationId,
        routeIdSet.size ? routeIdSet : null
      );
      if (error) {
        results.push({ stationId: st.stationId, error, rateLimited: !!rateLimited });
        if (rateLimited) break;
        continue;
      }
      const outcome = observe(String(st.stationId), st.name, arrivals, approach, history);
      if (outcome.changed) changed = true;
      recorded += outcome.recorded;
      results.push({ stationId: st.stationId, arrivals: arrivals.length, recorded: outcome.recorded });
    }

    state.approach = approach;
    state.history = history;
    const save = await saveState(state, { changed, auto: true });

    return res.status(200).json({
      ok: true,
      windowRole,
      stations: results,
      recorded,
      historyKeys: Object.keys(history).length,
      approachKeys: Object.keys(approach).length,
      wrote: save.written,
      putReason: save.written ? undefined : save.reason,
      puts: save.count,
      at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
