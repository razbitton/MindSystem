import DashboardView from "@/views/dashboard-view";
import { serverApiGet } from "@/lib/server-api";
import type { AnyRecord } from "@/lib/api";

export default async function DashboardPage() {
  const [dashboard, notes] = await Promise.all([
    serverApiGet<AnyRecord>("/api/dashboard/today"),
    serverApiGet<{ notes: AnyRecord[] }>("/api/notes")
  ]);

  return <DashboardView initialDashboard={dashboard} initialNotes={notes.notes} />;
}
