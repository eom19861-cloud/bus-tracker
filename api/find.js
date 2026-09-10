const { asList, cors, gbis, jsonError, pick } = require('../lib/gbis');

module.exports = async function handler(req, res) {
  cors(res);
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'q(버스번호) 파라미터 필요' });
  }

  try {
    const { header, body } = await gbis('/busrouteservice/v2/getBusRouteListv2', { keyword: q });
    const routes = asList(body.busRouteList).map((row) => ({
      routeId: pick(row, 'routeId'),
      routeName: pick(row, 'routeName'),
      region: pick(row, 'regionName'),
      type: pick(row, 'routeTypeName'),
    })).filter((row) => row.routeId && row.routeName);

    return res.status(200).json({ query: q, routes, header });
  } catch (error) {
    return jsonError(res, error);
  }
};
