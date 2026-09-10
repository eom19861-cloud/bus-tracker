"use client";

import { crowdedLabel, type Arrival } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FavoriteButton } from "./FavoriteButton";
import { formatWait, RouteBadge, waitTone } from "./RouteBadge";

export function StationBoard({
  stationId,
  stationName,
  regionName,
  mobileNo,
}: {
  stationId: string;
  stationName: string;
  regionName: string;
  mobileNo: string;
}) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/arrivals?stationId=${encodeURIComponent(stationId)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "도착정보를 불러오지 못했습니다.");
      setArrivals(data.arrivals ?? []);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "도착정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    const immediate = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 20000);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(timer);
    };
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-[#141b24] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[#93a1b1]">{regionName || "경기도"}</p>
            <h2 className="text-xl font-semibold">{stationName || `정류소 ${stationId}`}</h2>
            <p className="mt-1 text-xs text-[#93a1b1]">
              {mobileNo ? `정류소번호 ${mobileNo}` : `ID ${stationId}`}
              {updatedAt ? ` · ${updatedAt.toLocaleTimeString("ko-KR")}` : ""}
            </p>
          </div>
          <FavoriteButton
            stationId={stationId}
            stationName={stationName || stationId}
            regionName={regionName}
            mobileNo={mobileNo}
          />
        </div>
      </div>

      {loading && <p className="text-sm text-[#93a1b1]">도착정보를 불러오는 중...</p>}
      {error && (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {!loading && !error && arrivals.length === 0 && (
        <p className="text-sm text-[#93a1b1]">이 정류소의 도착정보가 없습니다.</p>
      )}

      <div className="flex flex-col gap-2">
        {arrivals.map((item) => (
          <Link
            key={`${item.routeId}-${item.staOrder}`}
            href={`/routes/${item.routeId}`}
            className="rounded-2xl border border-white/10 bg-[#141b24] px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <RouteBadge name={item.routeName} typeCd={item.routeTypeCd} />
                  <span className="truncate text-sm text-[#93a1b1]">{item.routeDestName} 방면</span>
                </div>
                <p className="mt-2 text-xs text-[#93a1b1]">
                  {item.stationNm1 ? `${item.stationNm1}` : item.locationNo1 ? `${item.locationNo1}정류장 전` : "위치 정보 없음"}
                  {item.plateNo1 ? ` · ${item.plateNo1}` : ""}
                  {crowdedLabel(item.crowded1) ? ` · ${crowdedLabel(item.crowded1)}` : ""}
                  {Number(item.remainSeatCnt1) >= 0 ? ` · 잔여 ${item.remainSeatCnt1}석` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-semibold ${waitTone(item.predictTime1)}`}>
                  {formatWait(item.predictTime1)}
                </p>
                {item.predictTime2 && Number(item.predictTime2) >= 0 && (
                  <p className="text-xs text-[#93a1b1]">다음 {formatWait(item.predictTime2)}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
