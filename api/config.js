// Public Mapbox token only (pk.*). Never put secret tokens here.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const mapboxToken = (process.env.MAPBOX_TOKEN || '').trim();
  if (!mapboxToken) {
    return res.status(500).json({
      error: 'MAPBOX_TOKEN 미설정',
      hint: 'Vercel Environment Variables에 MAPBOX_TOKEN(pk.로 시작)을 추가한 뒤 Redeploy 하세요.',
    });
  }
  if (!mapboxToken.startsWith('pk.')) {
    return res.status(500).json({
      error: '잘못된 토큰 형식',
      hint: '브라우저용 Public token(pk.)을 사용하세요. Secret(sk.)은 넣지 마세요.',
    });
  }

  return res.status(200).json({ mapboxToken });
}
