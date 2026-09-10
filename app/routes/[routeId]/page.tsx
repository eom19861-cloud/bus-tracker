import { RouteMap } from "@/components/RouteMap";

export default async function RoutePage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  const { routeId } = await params;
  return <RouteMap routeId={routeId} />;
}
