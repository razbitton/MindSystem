import DashboardView from "@/views/dashboard-view";
import { serverApiGet } from "@/lib/server-api";
import type { AnyRecord } from "@/lib/api";

export default async function DashboardPage() {
  const [dashboard, notes, projects] = await Promise.all([
    serverApiGet<AnyRecord>("/api/dashboard/today"),
    serverApiGet<{ notes: AnyRecord[] }>("/api/notes"),
    serverApiGet<{ projects: AnyRecord[] }>("/api/projects")
  ]);

  return <DashboardView initialDashboard={dashboard} initialNotes={notes.notes} initialProjects={projects.projects} />;
}
