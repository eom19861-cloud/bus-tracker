const KEY = "bus-tracker-favorites-v1";

export type FavoriteStation = {
  stationId: string;
  stationName: string;
  mobileNo?: string;
  regionName?: string;
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function read(): FavoriteStation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FavoriteStation[]) : [];
  } catch {
    return [];
  }
}

function write(items: FavoriteStation[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  emit();
}

export function listFavorites() {
  return read();
}

export function isFavorite(stationId: string) {
  return read().some((item) => item.stationId === stationId);
}

export function toggleFavorite(station: FavoriteStation) {
  const current = read();
  const exists = current.some((item) => item.stationId === station.stationId);
  const next = exists
    ? current.filter((item) => item.stationId !== station.stationId)
    : [station, ...current].slice(0, 20);
  write(next);
  return !exists;
}

export function subscribeFavorites(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
