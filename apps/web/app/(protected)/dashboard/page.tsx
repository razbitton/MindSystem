import DashboardView from "@/views/dashboard-view";
import { serverApiGet } from "@/lib/server-api";
import type { AnyRecord } from "@/lib/api";

export default async function DashboardPage() {
  const dashboard = await serverApiGet<AnyRecord>("/api/dashboard/today");

  return <DashboardView initialDashboard={dashboard} />;
}
