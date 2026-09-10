import { jsonError } from "@/lib/api-response";
import { searchStations } from "@/lib/gbis";

export async function GET(request: Request) {
  const keyword = new URL(request.url).searchParams.get("keyword")?.trim() ?? "";
  if (keyword.length < 1) {
    return Response.json({ error: "정류소명 또는 번호를 입력하세요." }, { status: 400 });
  }
  try {
    const stations = await searchStations(keyword);
    return Response.json({ stations });
  } catch (error) {
    return jsonError(error);
  }
}
