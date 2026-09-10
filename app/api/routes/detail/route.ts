import { jsonError } from "@/lib/api-response";
import { getBusLocations, getRouteInfo, getRouteStations } from "@/lib/gbis";

export async function GET(request: Request) {
  const routeId = new URL(request.url).searchParams.get("routeId")?.trim() ?? "";
  if (!routeId) {
    return Response.json({ error: "노선이 필요합니다." }, { status: 400 });
  }
  try {
    const [info, stations, buses] = await Promise.all([
      getRouteInfo(routeId),
      getRouteStations(routeId),
      getBusLocations(routeId),
    ]);
    return Response.json({ info, stations, buses });
  } catch (error) {
    return jsonError(error);
  }
}
