const { asList, cors, gbis, jsonError, pick } = require('../lib/gbis');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stationPath(stations) {
  return stations.map((s) => ({ lat: s.lat, lng: s.lng, seq: s.seq }));
}

function smoothPath(stations) {
  if (stations.length < 2) return stationPath(stations);
  const out = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    out.push({ lat: a.lat, lng: a.lng, seq: a.seq });
    const steps = 8;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lng = a.lng + (b.lng - a.lng) * t;
      const nx = -(b.lat - a.lat);
      const ny = b.lng - a.lng;
      const mag = Math.hypot(nx, ny) || 1;
      const bulge = Math.sin(Math.PI * t) * 0.00018;
      out.push({
        lat: lat + (nx / mag) * bulge,
        lng: lng + (ny / mag) * bulge,
        seq: a.seq,
      });
    }
  }
  const last = stations[stations.length - 1];
  out.push({ lat: last.lat, lng: last.lng, seq: last.seq });
  return out;
}

async function officialPath(routeId) {
  const { body } = await gbis('/busrouteservice/v2/getBusRouteLineListv2', { routeId });
  const line = asList(body.busRouteLineList)
    .map((row, index) => ({
      lat: num(pick(row, 'y')),
      lng: num(pick(row, 'x')),
      seq: num(pick(row, 'seq', 'stationSeq')) ?? index + 1,
    }))
    .filter((p) => p.lat != null && p.lng != null);
  return line;
}

async function roadPath(stations) {
  const token = (process.env.MAPBOX_TOKEN || '').trim();
  if (!token || stations.length < 2) return null;

  const sampled = stations.length <= 100
    ? stations
    : stations.filter((_, i) => i === 0 || i === stations.length - 1 || i % Math.ceil(stations.length / 98) === 0);

  const coords = sampled.map((s) => `${s.lng},${s.lat}`).join(';');
  const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&tidy=true&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const geometry = data.matchings?.[0]?.geometry;
  if (!geometry || geometry.type !== 'LineString') return null;
  return geometry.coordinates.map((c, index) => ({ lng: c[0], lat: c[1], seq: index + 1 }));
}

module.exports = async function handler(req, res) {
  cors(res);
  const routeId = String(req.query.routeId || '').trim();
  const pathMode = String(req.query.pathMode || 'official').trim();
  if (!routeId) {
    return res.status(400).json({ error: 'routeId 쿼리 파라미터가 필요합니다.' });
  }

  try {
    const { body } = await gbis('/busrouteservice/v2/getBusRouteStationListv2', { routeId });
    const stations = asList(body.busRouteStationList)
      .map((row) => ({
        name: String(pick(row, 'stationName')),
        lat: num(pick(row, 'y')),
        lng: num(pick(row, 'x')),
        seq: num(pick(row, 'stationSeq')),
      }))
      .filter((s) => s.name && s.lat != null && s.lng != null)
      .sort((a, b) => (a.seq || 0) - (b.seq || 0));

    let path = stationPath(stations);
    let pathSource = 'stations';

    if (pathMode === 'official') {
      const line = await officialPath(routeId);
      if (line.length > stations.length) {
        path = line;
        pathSource = 'official-line';
      }
    } else if (pathMode === 'smooth') {
      path = smoothPath(stations);
      pathSource = 'smooth';
    } else if (pathMode === 'roads') {
      const matched = await roadPath(stations);
      if (matched?.length) {
        path = matched;
        pathSource = 'map-matching';
      } else {
        const line = await officialPath(routeId);
        if (line.length) {
          path = line;
          pathSource = 'official-line';
        }
      }
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      routeId,
      count: stations.length,
      stations,
      path,
      pathCount: path.length,
      pathSource,
      pathMode,
    });
  } catch (error) {
    return jsonError(res, error);
  }
};
