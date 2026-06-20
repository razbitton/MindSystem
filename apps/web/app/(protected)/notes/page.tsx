import NotesView from "@/views/notes-view";
import { serverApiGet } from "@/lib/server-api";
import type { AnyRecord } from "@/lib/api";

export default async function NotesPage() {
  const [notes, projects] = await Promise.all([
    serverApiGet<{ notes: AnyRecord[] }>("/api/notes"),
    serverApiGet<{ projects: AnyRecord[] }>("/api/projects")
  ]);

  return <NotesView initialNotes={notes.notes} initialProjects={projects.projects} />;
}
