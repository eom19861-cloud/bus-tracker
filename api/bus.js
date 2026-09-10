const { asList, cors, gbis, jsonError, pick } = require('../lib/gbis');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function stationCache(routeId) {
  const { body } = await gbis('/busrouteservice/v2/getBusRouteStationListv2', { routeId });
  const bySeq = new Map();
  const byId = new Map();
  for (const row of asList(body.busRouteStationList)) {
    const station = {
      stationId: String(pick(row, 'stationId')),
      stationName: String(pick(row, 'stationName')),
      seq: num(pick(row, 'stationSeq')),
      lat: num(pick(row, 'y')),
      lng: num(pick(row, 'x')),
    };
    if (station.seq != null) bySeq.set(station.seq, station);
    if (station.stationId) byId.set(station.stationId, station);
  }
  return { bySeq, byId };
}

function offsetForState(station, stateCd) {
  if (!station || station.lat == null || station.lng == null) return { lat: null, lng: null };
  const code = String(stateCd);
  // 0 교차로, 1 도착, 2 출발 — 정류소 좌표를 살짝 밀어 GPS처럼 보이게 합니다.
  const dy = code === '2' ? 0.00018 : code === '0' ? 0.00008 : 0;
  return { lat: station.lat + dy, lng: station.lng };
}

module.exports = async function handler(req, res) {
  cors(res);
  const routeId = String(req.query.routeId || '').trim();
  if (!routeId) {
    return res.status(400).json({ error: 'routeId 쿼리 파라미터가 필요합니다.' });
  }

  try {
    const [{ header, body }, cache] = await Promise.all([
      gbis('/buslocationservice/v2/getBusLocationListv2', { routeId }),
      stationCache(routeId),
    ]);

    const buses = asList(body.busLocationList).map((row) => {
      const stationSeq = num(pick(row, 'stationSeq'));
      const stationId = String(pick(row, 'stationId') || '');
      const station = (stationSeq != null && cache.bySeq.get(stationSeq)) || cache.byId.get(stationId);
      const pos = offsetForState(station, pick(row, 'stateCd'));
      return {
        plateNo: String(pick(row, 'plateNo')),
        lat: pos.lat,
        lng: pos.lng,
        hasGps: false,
        stationSeq,
        stationId: station?.stationId || stationId,
        stationName: station?.stationName || '',
        stateCd: num(pick(row, 'stateCd')),
        remainSeat: num(pick(row, 'remainSeatCnt')),
        crowded: num(pick(row, 'crowded')),
        lowPlate: num(pick(row, 'lowPlate')),
      };
    }).filter((bus) => bus.plateNo);

    return res.status(200).json({
      routeId,
      count: buses.length,
      buses,
      header,
      positionSource: 'station+state',
      stationCache: true,
    });
  } catch (error) {
    return jsonError(res, error);
  }
};
