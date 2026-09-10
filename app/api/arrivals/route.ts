import { jsonError } from "@/lib/api-response";
import { getArrivals } from "@/lib/gbis";

export async function GET(request: Request) {
  const stationId = new URL(request.url).searchParams.get("stationId")?.trim() ?? "";
  if (!stationId) {
    return Response.json({ error: "정류소가 필요합니다." }, { status: 400 });
  }
  try {
    const arrivals = await getArrivals(stationId);
    return Response.json({ arrivals });
  } catch (error) {
    return jsonError(error);
  }
}
