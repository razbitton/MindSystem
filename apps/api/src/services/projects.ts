import { documents, entities, notes, projects, tasks } from "@personal-context-os/db";
import { createProjectSchema, patchProjectSchema } from "@personal-context-os/shared";
import type { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { createGenericEntity } from "./entities.js";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

export async function createProject(context: AppContext, input: z.input<typeof createProjectSchema>, actor: Actor) {
  const parsed = createProjectSchema.parse(input);
  const entity = await createGenericEntity(context, {
    entityType: "project",
    title: parsed.name,
    summary: parsed.description ?? parsed.goal ?? null,
    body: parsed.description ?? null,
    status: parsed.status,
    canonical: parsed,
    customFields: {}
  });

  const [project] = await context.db
    .insert(projects)
    .values({
      workspaceId: context.workspaceId,
      entityId: entity.id,
      name: parsed.name,
      description: parsed.description ?? null,
      goal: parsed.goal ?? null,
      status: parsed.status,
      priority: parsed.priority,
      dueAt: parsed.dueAt ? new Date(parsed.dueAt) : null,
      ownerUserId: context.userId
    })
    .returning();

  await writeAuditEvent(context, { ...actor, action: "create entity", entityId: entity.id, metadata: { entityType: "project" } });
  return { project, entity };
}

export async function listProjects(context: AppContext) {
  const rows = await context.db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, context.workspaceId))
    .orderBy(desc(projects.updatedAt));

  return { projects: rows };
}

export async function getProject(context: AppContext, id: string) {
  const [project] = await context.db
    .select()
    .from(projects)
    .where(and(eq(projects.workspaceId, context.workspaceId), eq(projects.id, id)))
    .limit(1);

  if (!project) throw new Error("Project not found");
  return { project };
}

export async function getProjectContext(context: AppContext, id: string) {
  const { project } = await getProject(context, id);
  const [projectEntity] = await context.db.select().from(entities).where(eq(entities.id, project.entityId)).limit(1);
  const projectTasks = await context.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, context.workspaceId), eq(tasks.projectId, id)))
    .orderBy(desc(tasks.updatedAt));
  const projectNotes = await context.db
    .select()
    .from(notes)
    .where(and(eq(notes.workspaceId, context.workspaceId), eq(notes.projectId, id)))
    .orderBy(desc(notes.updatedAt));
  const projectDocuments = await context.db
    .select()
    .from(documents)
    .where(and(eq(documents.workspaceId, context.workspaceId), eq(documents.projectId, id)))
    .orderBy(desc(documents.updatedAt));

  const contextPack = [
    `# ${project.name}`,
    project.description,
    project.goal ? `Goal: ${project.goal}` : null,
    "## Open tasks",
    ...projectTasks.filter((task) => task.status !== "done" && task.status !== "cancelled").map((task) => `- [${task.priority}] ${task.title}`),
    "## Notes",
    ...projectNotes.slice(0, 10).map((note) => `- ${note.title}: ${note.body.slice(0, 240)}`)
  ]
    .filter(Boolean)
    .join("\n");

  return {
    project,
    entity: projectEntity ?? null,
    tasks: projectTasks,
    notes: projectNotes,
    documents: projectDocuments,
    decisions: [],
    contextPack
  };
}

export async function patchProject(context: AppContext, id: string, input: z.infer<typeof patchProjectSchema>, actor: Actor) {
  const updates: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.goal !== undefined) updates.goal = input.goal;
  if (input.status !== undefined) updates.status = input.status;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.dueAt !== undefined) updates.dueAt = input.dueAt ? new Date(input.dueAt) : null;

  const [project] = await context.db
    .update(projects)
    .set(updates)
    .where(and(eq(projects.workspaceId, context.workspaceId), eq(projects.id, id)))
    .returning();

  if (!project) throw new Error("Project not found");

  await context.db
    .update(entities)
    .set({
      title: project.name,
      summary: project.description ?? project.goal ?? null,
      body: project.description ?? null,
      status: project.status,
      updatedAt: new Date()
    })
    .where(eq(entities.id, project.entityId));

  await writeAuditEvent(context, { ...actor, action: "update entity", entityId: project.entityId, metadata: { entityType: "project" } });
  return { project };
}

export async function deleteProject(context: AppContext, id: string, actor: Actor) {
  const { project } = await getProject(context, id);

  await writeAuditEvent(context, {
    ...actor,
    action: "delete entity",
    entityId: project.entityId,
    metadata: { entityType: "project", projectId: id, title: project.name }
  });

  await context.db
    .delete(entities)
    .where(and(eq(entities.workspaceId, context.workspaceId), eq(entities.id, project.entityId)));

  return { ok: true };
}
