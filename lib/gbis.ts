import { asList, type Arrival, type BusLocation, type RouteStation, type RouteSummary, type Station } from "./types";

const BASE = "https://apis.data.go.kr/6410000";

function getServiceKey() {
  const raw =
    process.env.DATA_GO_KR_SERVICE_KEY ||
    process.env.SERVICE_KEY ||
    process.env.BUS_API_KEY ||
    "";
  return raw.trim();
}

export function hasServiceKey() {
  return Boolean(getServiceKey());
}

function encodeKey(key: string) {
  return key.includes("%") ? key : encodeURIComponent(key);
}

class GbisError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = "GbisError";
  }
}

function portalErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const header =
    (root.cmmMsgHeader as Record<string, unknown> | undefined) ||
    ((root.OpenAPI_ServiceResponse as Record<string, unknown> | undefined)?.cmmMsgHeader as
      | Record<string, unknown>
      | undefined);
  if (!header) return null;
  const code = String(header.returnReasonCode ?? header.returnAuthMsg ?? "");
  const auth = String(header.returnAuthMsg ?? "");
  if (auth.includes("LIMITED_NUMBER") || code === "22") {
    return "오늘 호출 한도를 초과했습니다. 공공데이터포털에서 운영계정 트래픽이 승인됐는지 확인하세요.";
  }
  if (auth.includes("SERVICE_KEY") || auth.includes("HTTP_ERROR") || code === "30" || code === "31") {
    return "버스 API 인증키가 없거나 유효하지 않습니다. Vercel Environment Variables에 DATA_GO_KR_SERVICE_KEY를 넣었는지 확인하세요.";
  }
  if (auth.includes("NO_OPENAPI_SERVICE_ERROR") || code === "12") {
    return "해당 버스 API 서비스가 등록되어 있지 않습니다. 공공데이터포털에서 활용신청이 승인됐는지 확인하세요.";
  }
  return auth || "공공데이터포털에서 오류가 반환되었습니다.";
}

async function gbisFetch(path: string, params: Record<string, string>) {
  const key = getServiceKey();
  if (!key) {
    throw new GbisError(
      "버스 API 인증키가 없습니다. Vercel 프로젝트 Settings → Environment Variables에 DATA_GO_KR_SERVICE_KEY를 추가한 뒤 Redeploy 하세요.",
      500,
    );
  }

  const search = new URLSearchParams({ format: "json", ...params });
  const url = `${BASE}${path}?serviceKey=${encodeKey(key)}&${search.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    if (text.includes("SERVICE_KEY") || text.includes("LIMITED_NUMBER")) {
      throw new GbisError(portalErrorMessage({ cmmMsgHeader: { returnAuthMsg: text } }) || text);
    }
    throw new GbisError("경기도 버스 API 응답을 읽지 못했습니다.");
  }

  const portalMsg = portalErrorMessage(data);
  if (portalMsg) throw new GbisError(portalMsg);

  const response = (data as { response?: { msgHeader?: { resultCode?: string | number; resultMessage?: string }; msgBody?: Record<string, unknown> } }).response;
  const code = String(response?.msgHeader?.resultCode ?? "");
  if (code && code !== "0") {
    if (code === "4") return {};
    throw new GbisError(response?.msgHeader?.resultMessage || `버스 API 오류 (${code})`);
  }
  return response?.msgBody ?? {};
}

function pick(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value) !== "") return String(value);
  }
  return "";
}

export async function searchStations(keyword: string): Promise<Station[]> {
  const body = await gbisFetch("/busstationservice/v2/getBusStationListv2", { keyword });
  return asList(body.busStationList as Record<string, unknown>[]).map((row) => ({
    stationId: pick(row, "stationId"),
    stationName: pick(row, "stationName"),
    mobileNo: pick(row, "mobileNo"),
    regionName: pick(row, "regionName"),
    x: pick(row, "x"),
    y: pick(row, "y"),
    centerYn: pick(row, "centerYn"),
  }));
}

export async function nearbyStations(x: string, y: string): Promise<Station[]> {
  const body = await gbisFetch("/busstationservice/v2/getBusStationAroundListv2", { x, y });
  return asList(
    (body.busStationAroundList as Record<string, unknown>[] | undefined) ??
      (body.busStationList as Record<string, unknown>[] | undefined),
  ).map((row) => ({
    stationId: pick(row, "stationId"),
    stationName: pick(row, "stationName"),
    mobileNo: pick(row, "mobileNo"),
    regionName: pick(row, "regionName"),
    x: pick(row, "x"),
    y: pick(row, "y"),
    centerYn: pick(row, "centerYn"),
  }));
}

export async function searchRoutes(keyword: string): Promise<RouteSummary[]> {
  const body = await gbisFetch("/busrouteservice/v2/getBusRouteListv2", { keyword });
  return asList(body.busRouteList as Record<string, unknown>[]).map((row) => ({
    routeId: pick(row, "routeId"),
    routeName: pick(row, "routeName"),
    routeTypeCd: pick(row, "routeTypeCd"),
    routeTypeName: pick(row, "routeTypeName"),
    regionName: pick(row, "regionName"),
    startStationName: pick(row, "startStationName"),
    endStationName: pick(row, "endStationName"),
  }));
}

export async function getRouteInfo(routeId: string): Promise<RouteSummary | null> {
  const body = await gbisFetch("/busrouteservice/v2/getBusRouteInfoItemv2", { routeId });
  const row = asList(body.busRouteInfoItem as Record<string, unknown>[])[0];
  if (!row) return null;
  return {
    routeId: pick(row, "routeId") || routeId,
    routeName: pick(row, "routeName"),
    routeTypeCd: pick(row, "routeTypeCd"),
    routeTypeName: pick(row, "routeTypeName"),
    regionName: pick(row, "regionName"),
    startStationName: pick(row, "startStationName"),
    endStationName: pick(row, "endStationName"),
  };
}

export async function getRouteStations(routeId: string): Promise<RouteStation[]> {
  const body = await gbisFetch("/busrouteservice/v2/getBusRouteStationListv2", { routeId });
  return asList(body.busRouteStationList as Record<string, unknown>[])
    .map((row) => ({
      stationId: pick(row, "stationId"),
      stationName: pick(row, "stationName"),
      stationSeq: pick(row, "stationSeq"),
      mobileNo: pick(row, "mobileNo"),
      regionName: pick(row, "regionName"),
      turnYn: pick(row, "turnYn"),
    }))
    .sort((a, b) => Number(a.stationSeq) - Number(b.stationSeq));
}

export async function getArrivals(stationId: string): Promise<Arrival[]> {
  const body = await gbisFetch("/busarrivalservice/v2/getBusArrivalListv2", { stationId });
  return asList(body.busArrivalList as Record<string, unknown>[]).map((row) => ({
    routeId: pick(row, "routeId"),
    routeName: pick(row, "routeName"),
    routeTypeCd: pick(row, "routeTypeCd"),
    routeDestName: pick(row, "routeDestName"),
    flag: pick(row, "flag"),
    predictTime1: pick(row, "predictTime1"),
    predictTime2: pick(row, "predictTime2"),
    locationNo1: pick(row, "locationNo1"),
    locationNo2: pick(row, "locationNo2"),
    plateNo1: pick(row, "plateNo1"),
    plateNo2: pick(row, "plateNo2"),
    remainSeatCnt1: pick(row, "remainSeatCnt1"),
    remainSeatCnt2: pick(row, "remainSeatCnt2"),
    crowded1: pick(row, "crowded1"),
    crowded2: pick(row, "crowded2"),
    staOrder: pick(row, "staOrder"),
    stationNm1: pick(row, "stationNm1"),
    lowPlate1: pick(row, "lowPlate1"),
  }));
}

export async function getBusLocations(routeId: string): Promise<BusLocation[]> {
  const body = await gbisFetch("/buslocationservice/v2/getBusLocationListv2", { routeId });
  return asList(body.busLocationList as Record<string, unknown>[]).map((row) => ({
    plateNo: pick(row, "plateNo"),
    stationId: pick(row, "stationId"),
    stationSeq: pick(row, "stationSeq"),
    crowded: pick(row, "crowded"),
    remainSeatCnt: pick(row, "remainSeatCnt"),
    stateCd: pick(row, "stateCd"),
    lowPlate: pick(row, "lowPlate"),
  }));
}

export { GbisError };
