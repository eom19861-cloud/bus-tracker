"use client";

import { isFavorite, subscribeFavorites, toggleFavorite, type FavoriteStation } from "@/lib/favorites";
import { useSyncExternalStore } from "react";

export function FavoriteButton(station: FavoriteStation) {
  const on = useSyncExternalStore(
    subscribeFavorites,
    () => isFavorite(station.stationId),
    () => false,
  );

  return (
    <button
      type="button"
      onClick={() => toggleFavorite(station)}
      className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-[#d8e2ec]"
      aria-pressed={on}
    >
      {on ? "★ 즐겨찾기" : "☆ 즐겨찾기"}
    </button>
  );
}
