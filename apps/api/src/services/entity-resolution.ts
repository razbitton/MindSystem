import { entities, projects, tasks } from "@personal-context-os/db";
import { and, eq, ilike } from "drizzle-orm";
import type { AppContext } from "./types.js";

export function normalizeEntityTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function findProjectByName(context: AppContext, name: string) {
  const [project] = await context.db
    .select()
    .from(projects)
    .where(and(eq(projects.workspaceId, context.workspaceId), ilike(projects.name, name.trim())))
    .limit(1);

  return project ?? null;
}

export async function findEntityByTitle(
  context: AppContext,
  entityType: "project" | "task" | "note" | "document" | "decision" | "reminder" | "person" | "goal",
  title: string
) {
  const [entity] = await context.db
    .select()
    .from(entities)
    .where(and(eq(entities.workspaceId, context.workspaceId), eq(entities.entityType, entityType), ilike(entities.title, title.trim())))
    .limit(1);

  return entity ?? null;
}

export async function findTaskByTitle(context: AppContext, title: string) {
  const [task] = await context.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, context.workspaceId), ilike(tasks.title, title.trim())))
    .limit(1);

  return task ?? null;
}
