import TasksView from "@/views/tasks-view";
import { serverApiGet } from "@/lib/server-api";
import type { AnyRecord } from "@/lib/api";

export default async function TasksPage() {
  const [tasks, projects] = await Promise.all([
    serverApiGet<{ tasks: AnyRecord[] }>("/api/tasks"),
    serverApiGet<{ projects: AnyRecord[] }>("/api/projects")
  ]);

  return <TasksView initialTasks={tasks.tasks} initialProjects={projects.projects} />;
}
