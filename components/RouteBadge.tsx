import { routeStyle } from "@/lib/types";

export function RouteBadge({
  name,
  typeCd,
}: {
  name: string;
  typeCd?: string | number;
}) {
  const style = routeStyle(typeCd);
  return (
    <span
      className="inline-flex min-w-12 items-center justify-center rounded-md px-2 py-1 text-sm font-bold leading-none tracking-tight"
      style={{ background: style.plate, color: style.text }}
    >
      {name}
    </span>
  );
}

export function formatWait(minutes?: string) {
  if (minutes == null || minutes === "" || Number(minutes) < 0) return "정보없음";
  const n = Number(minutes);
  if (Number.isNaN(n)) return "정보없음";
  if (n <= 1) return "곧 도착";
  return `${n}분`;
}

export function waitTone(minutes?: string) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n < 0) return "text-[#93a1b1]";
  if (n <= 3) return "text-[#ffb703]";
  if (n <= 8) return "text-[#d8e2ec]";
  return "text-[#93a1b1]";
}
