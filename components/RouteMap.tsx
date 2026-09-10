"use client";

import { crowdedLabel, type BusLocation, type RouteStation, type RouteSummary } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RouteBadge } from "./RouteBadge";

export function RouteMap({ routeId }: { routeId: string }) {
  const [info, setInfo] = useState<RouteSummary | null>(null);
  const [stations, setStations] = useState<RouteStation[]>([]);
  const [buses, setBuses] = useState<BusLocation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/routes/detail?routeId=${encodeURIComponent(routeId)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "노선 정보를 불러오지 못했습니다.");
      setInfo(data.info);
      setStations(data.stations ?? []);
      setBuses(data.buses ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "노선 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    const immediate = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 20000);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(timer);
    };
  }, [load]);

  const busesBySeq = useMemo(() => {
    const map = new Map<string, BusLocation[]>();
    for (const bus of buses) {
      const key = String(bus.stationSeq || "");
      map.set(key, [...(map.get(key) ?? []), bus]);
    }
    return map;
  }, [buses]);

  const stateLabel = (code?: string) => {
    if (code === "0") return "교차로";
    if (code === "1") return "도착";
    if (code === "2") return "출발";
    return "";
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-[#141b24] p-5">
        <div className="flex items-center gap-3">
          <RouteBadge name={info?.routeName || "..."} typeCd={info?.routeTypeCd} />
          <div>
            <p className="text-sm text-[#93a1b1]">{info?.routeTypeName || "노선"}</p>
            <p className="text-sm">
              {info?.startStationName} → {info?.endStationName}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-[#93a1b1]">운행 중 {buses.length}대 · 20초마다 갱신</p>
      </div>

      {loading && <p className="text-sm text-[#93a1b1]">노선을 불러오는 중...</p>}
      {error && (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <ol className="relative ml-3 border-l border-white/10 pl-5">
        {stations.map((station) => {
          const here = busesBySeq.get(station.stationSeq) ?? [];
          return (
            <li key={`${station.stationId}-${station.stationSeq}`} className="mb-4">
              <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-[#ffb703]" />
              <Link href={`/stations/${station.stationId}?name=${encodeURIComponent(station.stationName)}`} className="block">
                <p className="text-sm font-medium">
                  {station.stationName}
                  {station.turnYn === "Y" ? " · 회차" : ""}
                </p>
                <p className="text-xs text-[#93a1b1]">
                  {station.stationSeq}번째
                  {station.mobileNo ? ` · ${station.mobileNo}` : ""}
                </p>
              </Link>
              {here.map((bus) => (
                <div
                  key={bus.plateNo}
                  className="mt-2 rounded-xl bg-[#ffb703]/12 px-3 py-2 text-xs text-[#ffb703]"
                >
                  버스 {bus.plateNo}
                  {stateLabel(bus.stateCd) ? ` · ${stateLabel(bus.stateCd)}` : ""}
                  {crowdedLabel(bus.crowded) ? ` · ${crowdedLabel(bus.crowded)}` : ""}
                  {Number(bus.remainSeatCnt) >= 0 ? ` · 잔여 ${bus.remainSeatCnt}석` : ""}
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
