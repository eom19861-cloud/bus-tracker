const BASE = 'https://apis.data.go.kr/6410000';

function getServiceKey() {
  return (
    process.env.DATA_GO_KR_SERVICE_KEY ||
    process.env.SERVICE_KEY ||
    process.env.BUS_API_KEY ||
    ''
  ).trim();
}

function encodeKey(key) {
  return key.includes('%') ? key : encodeURIComponent(key);
}

function asList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function pick(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && String(value) !== '') return value;
  }
  return '';
}

function portalError(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const header =
    payload.cmmMsgHeader ||
    payload.OpenAPI_ServiceResponse?.cmmMsgHeader ||
    null;
  if (!header) return null;
  return {
    errMsg: header.errMsg,
    returnAuthMsg: header.returnAuthMsg,
    returnReasonCode: header.returnReasonCode,
  };
}

async function gbis(path, params = {}) {
  const key = getServiceKey();
  if (!key) {
    const err = new Error('버스 API 인증키가 없습니다.');
    err.status = 500;
    err.authError = { errMsg: 'MISSING_SERVICE_KEY' };
    throw err;
  }

  const search = new URLSearchParams({ format: 'json', ...params });
  const url = `${BASE}${path}?serviceKey=${encodeKey(key)}&${search.toString()}`;
  const res = await fetch(url, { cache: 'no-store' });
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error('경기도 버스 API 응답을 읽지 못했습니다.');
    err.status = 502;
    throw err;
  }

  const auth = portalError(data);
  if (auth) {
    const limited = String(auth.returnAuthMsg || '').includes('LIMITED_NUMBER') || String(auth.returnReasonCode) === '22';
    const err = new Error(auth.returnAuthMsg || auth.errMsg || '공공데이터포털 오류');
    err.status = 502;
    err.authError = auth;
    err.rateLimited = limited;
    throw err;
  }

  const response = data.response || {};
  const code = String(response.msgHeader?.resultCode ?? '0');
  if (code && code !== '0' && code !== '4') {
    const err = new Error(response.msgHeader?.resultMessage || `버스 API 오류 (${code})`);
    err.status = 502;
    throw err;
  }

  return {
    header: response.msgHeader || {},
    body: response.msgBody || {},
  };
}

function jsonError(res, error) {
  const status = error.status || 502;
  return res.status(status).json({
    error: error.message || 'API 오류',
    authError: error.authError,
    rateLimited: !!error.rateLimited,
  });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

module.exports = {
  asList,
  cors,
  gbis,
  getServiceKey,
  jsonError,
  pick,
};
