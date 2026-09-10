const { cors } = require('../lib/gbis');

module.exports = async function handler(req, res) {
  cors(res);
  const token = (process.env.MAPBOX_TOKEN || '').trim();
  if (!token) {
    return res.status(500).json({
      error: 'Mapbox 토큰 필요',
      hint: 'Vercel에 MAPBOX_TOKEN(pk.)을 추가한 뒤 Redeploy 하세요.',
    });
  }
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).json({ mapboxToken: token });
};
