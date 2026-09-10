"use client";

import { listFavorites, subscribeFavorites, type FavoriteStation } from "@/lib/favorites";
import type { RouteSummary, Station } from "@/lib/types";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { RouteBadge } from "./RouteBadge";

type Tab = "station" | "route";

export function HomeSearch() {
  const [tab, setTab] = useState<Tab>("station");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const favorites = useSyncExternalStore(subscribeFavorites, listFavorites, () => [] as FavoriteStation[]);
  const [geoState, setGeoState] = useState("");

  const placeholder = tab === "station" ? "정류소명 또는 번호" : "노선번호 (예: 1112, 720)";

  async function runSearch(nextQuery = query) {
    const keyword = nextQuery.trim();
    if (!keyword) return;
    setLoading(true);
    setError("");
    try {
      if (tab === "station") {
        const res = await fetch(`/api/stations?keyword=${encodeURIComponent(keyword)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "검색에 실패했습니다.");
        setStations(data.stations ?? []);
        setRoutes([]);
      } else {
        const res = await fetch(`/api/routes?keyword=${encodeURIComponent(keyword)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "검색에 실패했습니다.");
        setRoutes(data.routes ?? []);
        setStations([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "검색에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function findNearby() {
    if (!navigator.geolocation) {
      setGeoState("이 브라우저는 위치 정보를 지원하지 않습니다.");
      return;
    }
    setGeoState("현재 위치를 찾는 중...");
    setLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const x = String(position.coords.longitude);
          const y = String(position.coords.latitude);
          const res = await fetch(`/api/stations/around?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "주변 정류소를 찾지 못했습니다.");
          setStations(data.stations ?? []);
          setRoutes([]);
          setTab("station");
          setGeoState(data.stations?.length ? "주변 200m 정류소" : "주변에 정류소가 없습니다.");
        } catch (err) {
          setError(err instanceof Error ? err.message : "주변 정류소를 찾지 못했습니다.");
          setGeoState("");
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLoading(false);
        setGeoState("");
        setError("위치 권한이 필요합니다. 브라우저에서 위치 접근을 허용해 주세요.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const emptyHint = useMemo(() => {
    if (loading || error || stations.length || routes.length) return "";
    return tab === "station" ? "정류소를 검색하거나 내 주변을 눌러 보세요." : "노선번호를 검색해 보세요.";
  }, [error, loading, routes.length, stations.length, tab]);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-[#141b24] p-3">
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-black/30 p-1">
          {(
            [
              ["station", "정류소"],
              ["route", "노선"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setError("");
              }}
              className={`rounded-xl py-2 text-sm font-medium ${
                tab === id ? "bg-[#ffb703] text-[#111]" : "text-[#93a1b1]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-base outline-none placeholder:text-[#667687]"
          />
          <button
            type="submit"
            className="rounded-2xl bg-[#eef3f8] px-4 py-3 text-sm font-semibold text-[#111]"
          >
            검색
          </button>
        </form>
        <button
          type="button"
          onClick={() => void findNearby()}
          className="mt-2 w-full rounded-2xl border border-white/10 py-2.5 text-sm text-[#d8e2ec]"
        >
          내 주변 정류소
        </button>
      </div>

      {favorites.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium tracking-widest text-[#93a1b1]">즐겨찾기</h2>
          <div className="flex flex-col gap-2">
            {favorites.map((item) => (
              <StationRow key={item.stationId} station={item} />
            ))}
          </div>
        </section>
      )}

      {geoState && <p className="text-sm text-[#93a1b1]">{geoState}</p>}
      {loading && <p className="text-sm text-[#93a1b1]">불러오는 중...</p>}
      {error && (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {emptyHint && <p className="text-sm text-[#93a1b1]">{emptyHint}</p>}

      {stations.length > 0 && (
        <div className="flex flex-col gap-2">
          {stations.map((station) => (
            <StationRow key={station.stationId} station={station} />
          ))}
        </div>
      )}

      {routes.length > 0 && (
        <div className="flex flex-col gap-2">
          {routes.map((route) => (
            <Link
              key={route.routeId}
              href={`/routes/${route.routeId}`}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#141b24] px-4 py-3"
            >
              <RouteBadge name={route.routeName} typeCd={route.routeTypeCd} />
              <div className="min-w-0">
                <p className="truncate text-sm">{route.routeTypeName || "버스"}</p>
                <p className="truncate text-xs text-[#93a1b1]">
                  {route.startStationName} → {route.endStationName}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StationRow({ station }: { station: Station | FavoriteStation }) {
  return (
    <Link
      href={`/stations/${station.stationId}?name=${encodeURIComponent(station.stationName)}&region=${encodeURIComponent(station.regionName ?? "")}&no=${encodeURIComponent(station.mobileNo ?? "")}`}
      className="rounded-2xl border border-white/10 bg-[#141b24] px-4 py-3"
    >
      <p className="font-medium">{station.stationName}</p>
      <p className="text-xs text-[#93a1b1]">
        {[station.regionName, station.mobileNo ? `${station.mobileNo}` : ""].filter(Boolean).join(" · ") ||
          `ID ${station.stationId}`}
      </p>
    </Link>
  );
}
