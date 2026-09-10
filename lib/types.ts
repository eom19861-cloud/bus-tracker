export const ROUTE_TYPES: Record<number, { label: string; plate: string; text: string }> = {
  11: { label: "직행좌석", plate: "#c62828", text: "#fff" },
  12: { label: "좌석", plate: "#1565c0", text: "#fff" },
  13: { label: "일반", plate: "#2e7d32", text: "#fff" },
  14: { label: "광역급행", plate: "#6a1b9a", text: "#fff" },
  15: { label: "따복", plate: "#00838f", text: "#fff" },
  16: { label: "경기순환", plate: "#ad1457", text: "#fff" },
  17: { label: "직행좌석", plate: "#c62828", text: "#fff" },
  21: { label: "직행좌석", plate: "#c62828", text: "#fff" },
  22: { label: "좌석", plate: "#1565c0", text: "#fff" },
  23: { label: "일반", plate: "#2e7d32", text: "#fff" },
  30: { label: "마을", plate: "#f9a825", text: "#1a1a1a" },
  41: { label: "고속", plate: "#37474f", text: "#fff" },
  42: { label: "시외좌석", plate: "#455a64", text: "#fff" },
  43: { label: "시외", plate: "#546e7a", text: "#fff" },
  51: { label: "공항", plate: "#0d47a1", text: "#fff" },
  52: { label: "공항좌석", plate: "#1565c0", text: "#fff" },
  53: { label: "공항", plate: "#1976d2", text: "#fff" },
};

export function routeStyle(typeCd?: number | string) {
  const key = Number(typeCd);
  return ROUTE_TYPES[key] ?? { label: "버스", plate: "#263238", text: "#fff" };
}

export function asList<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function crowdedLabel(value?: number | string) {
  const n = Number(value);
  if (n === 1) return "여유";
  if (n === 2) return "보통";
  if (n === 3) return "혼잡";
  if (n === 4) return "매우혼잡";
  return "";
}

export type Station = {
  stationId: string;
  stationName: string;
  mobileNo?: string;
  regionName?: string;
  x?: string;
  y?: string;
  centerYn?: string;
};

export type RouteSummary = {
  routeId: string;
  routeName: string;
  routeTypeCd?: string;
  routeTypeName?: string;
  regionName?: string;
  startStationName?: string;
  endStationName?: string;
  routeDestName?: string;
  staOrder?: string;
};

export type Arrival = {
  routeId: string;
  routeName: string;
  routeTypeCd?: string;
  routeDestName?: string;
  flag?: string;
  predictTime1?: string;
  predictTime2?: string;
  locationNo1?: string;
  locationNo2?: string;
  plateNo1?: string;
  plateNo2?: string;
  remainSeatCnt1?: string;
  remainSeatCnt2?: string;
  crowded1?: string;
  crowded2?: string;
  staOrder?: string;
  stationNm1?: string;
  lowPlate1?: string;
};

export type BusLocation = {
  plateNo: string;
  stationId?: string;
  stationSeq?: string;
  crowded?: string;
  remainSeatCnt?: string;
  stateCd?: string;
  lowPlate?: string;
};

export type RouteStation = {
  stationId: string;
  stationName: string;
  stationSeq: string;
  mobileNo?: string;
  regionName?: string;
  turnYn?: string;
};
