import { jsonError } from "@/lib/api-response";
import { searchRoutes } from "@/lib/gbis";

export async function GET(request: Request) {
  const keyword = new URL(request.url).searchParams.get("keyword")?.trim() ?? "";
  if (keyword.length < 1) {
    return Response.json({ error: "노선번호를 입력하세요." }, { status: 400 });
  }
  try {
    const routes = await searchRoutes(keyword);
    return Response.json({ routes });
  } catch (error) {
    return jsonError(error);
  }
}
