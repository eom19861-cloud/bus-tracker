import { StationBoard } from "@/components/StationBoard";

export default async function StationPage({
  params,
  searchParams,
}: {
  params: Promise<{ stationId: string }>;
  searchParams: Promise<{ name?: string; region?: string; no?: string }>;
}) {
  const { stationId } = await params;
  const query = await searchParams;
  return (
    <StationBoard
      stationId={stationId}
      stationName={query.name ?? ""}
      regionName={query.region ?? ""}
      mobileNo={query.no ?? ""}
    />
  );
}
