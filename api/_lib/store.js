// Vercel Blob JSON store — watchlist / approach / history 를 **한 개의 state.json** 에 모아 둔다.
//
// 왜 하나로 모았나
// - Vercel Blob 의 업로드(put)·목록(list)은 Advanced Operation 이고, Hobby 무료 한도는 월 2,000건이다.
//   예전 코드는 수집기가 돌 때마다 watchlist/approach/history 를 각각 get 하고 approach·history 를
//   매번(변화가 없어도) put 해서 하루에 수천 건을 썼다. 이제 상태가 실제로 바뀐 경우에만 1회 put 한다.
// - list() 폴백은 없앴다. get() 만 쓰고, 없으면 기본값을 쓴다(list 는 호출 1회당 Advanced Operation).
// - 그래도 사고로 한도를 넘지 않도록 월 업로드 상한(BLOB_MONTHLY_PUT_BUDGET, 기본 1,500)을 둔다.
//   한도가 걸리면 저장을 건너뛰고 응답에 이유를 남긴다(앱은 계속 읽기/실시간 조회로 동작).
import { put, get } from '@vercel/blob';

const STATE_PATH = 'bus-tracker/state.json';
// 예전 버전이 남긴 파일들. state.json 이 없을 때만 한 번 읽어 데이터를 이어받는다.
const LEGACY_PATHS = {
  watchlist: 'bus-tracker/watchlist.json',
  approach: 'bus-tracker/approach.json',
  history: 'bus-tracker/history.json',
};

const HISTORY_KEEP_MS = 28 * 24 * 60 * 60 * 1000;
const MONTHLY_PUT_BUDGET = Number(process.env.BLOB_MONTHLY_PUT_BUDGET || 1500);
// 같은 함수가 짧은 시간에 여러 번 저장하지 않도록 하는 안전장치(수집 주기보다 짧게 둔다).
const MIN_WRITE_INTERVAL_MS = Number(process.env.STATE_MIN_WRITE_INTERVAL_MS || 5 * 60 * 1000);

function hasBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function emptyState() {
  return {
    v: 2,
    watchlist: { stations: [], routeIds: [], updatedAt: 0 },
    approach: {},
    history: {},
    writes: { month: monthKey(), count: 0 },
    // 마지막 저장 시각(모든 저장) / 마지막 자동(수집기) 저장 시각
    updatedAt: 0,
    lastAutoWriteAt: 0,
  };
}

function monthKey(at = Date.now()) {
  const d = new Date(at);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function readJson(pathname) {
  if (!hasBlob()) return null;
  try {
    const result = await get(pathname, {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const stations = Array.isArray(raw?.watchlist?.stations)
    ? raw.watchlist.stations.filter((s) => s && s.stationId)
    : [];
  const routeIds = Array.isArray(raw?.watchlist?.routeIds) ? raw.watchlist.routeIds.map(String) : [];
  return {
    ...base,
    watchlist: {
      stations,
      routeIds: [...new Set(routeIds.filter(Boolean))],
      updatedAt: Number(raw?.watchlist?.updatedAt) || 0,
    },
    approach: raw.approach && typeof raw.approach === 'object' ? raw.approach : {},
    history: raw.history && typeof raw.history === 'object' ? raw.history : {},
    writes: {
      month: raw?.writes?.month || base.writes.month,
      count: Number(raw?.writes?.count) || 0,
    },
    updatedAt: Number(raw?.updatedAt) || 0,
    lastAutoWriteAt: Number(raw?.lastAutoWriteAt) || 0,
  };
}

// state.json 을 읽는다. 없으면(첫 배포·저장소 초기화) 예전 파일에서 한 번만 이어받는다.
export async function getState() {
  const raw = await readJson(STATE_PATH);
  if (raw) return normalizeState(raw);

  const [legacyWatchlist, legacyApproach, legacyHistory] = await Promise.all([
    readJson(LEGACY_PATHS.watchlist),
    readJson(LEGACY_PATHS.approach),
    readJson(LEGACY_PATHS.history),
  ]);
  if (!legacyWatchlist && !legacyApproach && !legacyHistory) return emptyState();
  return normalizeState({
    watchlist: legacyWatchlist || undefined,
    approach: legacyApproach || {},
    history: legacyHistory || {},
  });
}

export function storeReady() {
  return hasBlob();
}

/**
 * state 를 저장한다. put 1회 = Advanced Operation 1건.
 * @param {object} state getState() 로 받은 상태 객체(그대로 갱신해서 넘긴다)
 * @param {{changed?: boolean, force?: boolean, auto?: boolean, minIntervalMs?: number}} opts
 *   auto: 수집기(주기 수집) 저장. 이 경우에만 최소 저장 간격을 적용한다.
 * @returns {Promise<{written: boolean, reason?: string, count?: number, month?: string}>}
 */
export async function saveState(state, opts = {}) {
  if (!hasBlob()) return { written: false, reason: 'no-blob' };

  const now = Date.now();
  const month = monthKey(now);
  const writes = state.writes && typeof state.writes === 'object' ? state.writes : { month, count: 0 };

  // 달이 바뀌면 카운터 리셋
  if (writes.month !== month) {
    writes.month = month;
    writes.count = 0;
  }
  state.writes = writes;

  if (!opts.force && opts.changed === false) {
    return { written: false, reason: 'unchanged', count: writes.count, month };
  }
  // 월 상한은 사용자가 즐겨찾기를 저장할 때도 적용한다(한도 초과로 Blob 이 잠기는 것을 막는 안전장치).
  if (writes.count >= MONTHLY_PUT_BUDGET) {
    return { written: false, reason: 'budget', count: writes.count, month, budget: MONTHLY_PUT_BUDGET };
  }
  const minInterval = (opts.force || !opts.auto) ? 0 : (opts.minIntervalMs ?? MIN_WRITE_INTERVAL_MS);
  const lastAuto = Number(state.lastAutoWriteAt) || 0;
  if (minInterval > 0 && lastAuto && now - lastAuto < minInterval) {
    return { written: false, reason: 'too-soon', count: writes.count, month };
  }

  writes.count += 1;
  state.updatedAt = now;
  if (opts.auto) state.lastAutoWriteAt = now;

  await put(STATE_PATH, JSON.stringify(state), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return { written: true, count: writes.count, month };
}

export async function getWatchlist() {
  const state = await getState();
  return state.watchlist;
}

export async function setWatchlist(watchlist) {
  const state = await getState();
  const payload = {
    stations: Array.isArray(watchlist?.stations) ? watchlist.stations : [],
    routeIds: Array.isArray(watchlist?.routeIds)
      ? [...new Set(watchlist.routeIds.map(String).filter(Boolean))]
      : [],
    updatedAt: Date.now(),
  };
  state.watchlist = payload;
  const save = await saveState(state, { force: true });
  return { watchlist: payload, save };
}

export async function getHistoryStore() {
  const state = await getState();
  return state.history;
}

export async function getApproachStore() {
  const state = await getState();
  return state.approach;
}

export function historyKey(stationId, routeId) {
  return `${stationId}|${routeId}`;
}

/**
 * 버스 도착 관측을 history 에 기록한다.
 * @returns {boolean} 새 도착 칸이 추가됐으면 true (같은 버스의 예상 시각 갱신이면 false)
 */
export function recordArrival(store, {
  stationId,
  routeId,
  routeName,
  stationName,
  atMs,
  replaceWindowMs = 8 * 60 * 1000,
}) {
  if (!stationId || !routeId) return false;
  const key = historyKey(stationId, routeId);
  const entry = store[key] || {
    stationId: String(stationId),
    routeId: String(routeId),
    routeName: routeName || String(routeId),
    stationName: stationName || '',
    arrivals: [],
  };
  entry.routeName = routeName || entry.routeName;
  entry.stationName = stationName || entry.stationName;
  const t = Number(atMs) || Date.now();
  // 같은 버스의 예상 도착은 더 가까운 관측으로 시각만 갱신한다.
  const near = entry.arrivals.findIndex((x) => Math.abs(Number(x) - t) < replaceWindowMs);
  const added = near < 0;
  if (!added) entry.arrivals[near] = t;
  else entry.arrivals.push(t);
  const cutoff = Date.now() - HISTORY_KEEP_MS;
  entry.arrivals = entry.arrivals
    .map(Number)
    .filter((x) => Number.isFinite(x) && x >= cutoff)
    .sort((a, b) => a - b);
  if (entry.arrivals.length > 800) entry.arrivals = entry.arrivals.slice(-800);
  store[key] = entry;
  return added;
}

export { HISTORY_KEEP_MS, STATE_PATH, MONTHLY_PUT_BUDGET };
