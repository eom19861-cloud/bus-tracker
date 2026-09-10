import { jsonError } from "@/lib/api-response";
import { nearbyStations } from "@/lib/gbis";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const x = searchParams.get("x")?.trim() ?? "";
  const y = searchParams.get("y")?.trim() ?? "";
  if (!x || !y) {
    return Response.json({ error: "위치 정보가 필요합니다." }, { status: 400 });
  }
  try {
    const stations = await nearbyStations(x, y);
    return Response.json({ stations });
  } catch (error) {
    return jsonError(error);
  }
}
