// Vercel Blob JSON store (watchlist / arrival history / approach tracking)
import { put, get, list } from '@vercel/blob';

const WATCHLIST_PATH = 'bus-tracker/watchlist.json';
const HISTORY_PATH = 'bus-tracker/history.json';
const APPROACH_PATH = 'bus-tracker/approach.json';
const HISTORY_KEEP_MS = 28 * 24 * 60 * 60 * 1000;

function hasBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

async function readJson(pathname, fallback) {
  if (!hasBlob()) return fallback;
  try {
    const result = await get(pathname, {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      const { blobs } = await list({
        prefix: pathname,
        limit: 5,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const hit = blobs.find((b) => b.pathname === pathname);
      if (!hit) return fallback;
      const r = await get(hit.url, {
        access: 'private',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      if (!r || r.statusCode !== 200 || !r.stream) return fallback;
      const text = await new Response(r.stream).text();
      return JSON.parse(text);
    }
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJson(pathname, data) {
  if (!hasBlob()) {
    throw new Error('BLOB_READ_WRITE_TOKEN이 없습니다. Vercel Blob 스토어를 연결하세요.');
  }
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export function storeReady() {
  return hasBlob();
}

export async function getWatchlist() {
  const data = await readJson(WATCHLIST_PATH, null);
  return data || { stations: [], routeIds: [], updatedAt: 0 };
}

export async function setWatchlist(watchlist) {
  const payload = {
    stations: Array.isArray(watchlist?.stations) ? watchlist.stations : [],
    routeIds: Array.isArray(watchlist?.routeIds)
      ? [...new Set(watchlist.routeIds.map(String))]
      : [],
    updatedAt: Date.now(),
  };
  await writeJson(WATCHLIST_PATH, payload);
  return payload;
}

export async function getHistoryStore() {
  const data = await readJson(HISTORY_PATH, null);
  return data && typeof data === 'object' ? data : {};
}

export async function setHistoryStore(store) {
  await writeJson(HISTORY_PATH, store || {});
}

export async function getApproachStore() {
  const data = await readJson(APPROACH_PATH, null);
  return data && typeof data === 'object' ? data : {};
}

export async function setApproachStore(store) {
  await writeJson(APPROACH_PATH, store || {});
}

export function historyKey(stationId, routeId) {
  return `${stationId}|${routeId}`;
}

export function recordArrival(store, {
  stationId,
  routeId,
  routeName,
  stationName,
  atMs,
}) {
  if (!stationId || !routeId) return store;
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
  if (!entry.arrivals.some((x) => Math.abs(Number(x) - t) < 120000)) {
    entry.arrivals.push(t);
  }
  const cutoff = Date.now() - HISTORY_KEEP_MS;
  entry.arrivals = entry.arrivals
    .map(Number)
    .filter((x) => Number.isFinite(x) && x >= cutoff)
    .sort((a, b) => a - b);
  if (entry.arrivals.length > 800) entry.arrivals = entry.arrivals.slice(-800);
  store[key] = entry;
  return store;
}

export { HISTORY_KEEP_MS };
