import { documents, entities, notes, projects, tasks } from "@personal-context-os/db";
import { createProjectSchema, patchProjectSchema } from "@personal-context-os/shared";
import type { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { composeEntityChunkText, replaceEntityChunks } from "./chunks.js";
import { createGenericEntity } from "./entities.js";
import { enqueuePostIngestJobs } from "./queues.js";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

type ProjectMemoryRow = {
  memoryId: string;
  entityId: string;
  kind: string;
  title: string;
  summary: string | null;
  body: string;
  importance: string;
  validity: string;
  staleAfter: Date | string | null;
  expiresAt: Date | string | null;
  confidenceReason: string | null;
  sourceQuotes: string[];
  sourceRawItemIds: string[];
  updatedAt: Date | string;
};

export async function createProject(context: AppContext, input: z.input<typeof createProjectSchema>, actor: Actor) {
  const parsed = createProjectSchema.parse(input);
  const entity = await createGenericEntity(context, {
    entityType: "project",
    title: parsed.name,
    summary: parsed.description ?? parsed.goal ?? null,
    body: parsed.description ?? null,
    status: parsed.status,
    canonical: parsed,
    customFields: {},
    chunkText: projectChunkText(parsed)
  });

  const [project] = await context.db
    .insert(projects)
    .values({
      workspaceId: context.workspaceId,
      entityId: entity.id,
      name: parsed.name,
      description: parsed.description ?? null,
      goal: parsed.goal ?? null,
      color: parsed.color ?? null,
      status: parsed.status,
      priority: parsed.priority,
      dueAt: parsed.dueAt ? new Date(parsed.dueAt) : null,
      ownerUserId: context.userId
    })
    .returning();

  await writeAuditEvent(context, { ...actor, action: "create entity", entityId: entity.id, metadata: { entityType: "project" } });
  await enqueuePostIngestJobs(context, [entity.id]);
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
  const projectMemories = await loadProjectMemories(context, id);
  const decisions = projectMemories.filter((memory) => memory.kind === "decision");
  const constraints = projectMemories.filter((memory) => memory.kind === "constraint");
  const preferences = projectMemories.filter((memory) => memory.kind === "preference");
  const commitments = projectMemories.filter((memory) => memory.kind === "commitment");
  const openQuestions = projectMemories.filter((memory) => memory.kind === "open_question");
  const recentProjectUpdates = projectMemories.filter((memory) => memory.kind === "project_update");
  const staleItems = projectMemories.filter(isProjectMemoryStale);
  const conflicts = projectMemories.filter((memory) => memory.validity === "disputed");
  const sourceQuotes = buildProjectSourceQuotes(projectMemories);

  const contextPack = [
    `# ${project.name}`,
    project.description,
    project.goal ? `Goal: ${project.goal}` : null,
    "## Open tasks",
    ...projectTasks.filter((task) => task.status !== "done" && task.status !== "cancelled").map((task) => `- [${task.priority}] ${task.title}`),
    "## Decisions",
    ...linesOrEmpty(decisions, memoryLine, "No project-linked decisions recorded."),
    "## Constraints",
    ...linesOrEmpty(constraints, memoryLine, "No project-linked constraints recorded."),
    "## Preferences",
    ...linesOrEmpty(preferences, memoryLine, "No project-linked preferences recorded."),
    "## Commitments",
    ...linesOrEmpty(commitments, memoryLine, "No project-linked commitments recorded."),
    "## Open questions",
    ...linesOrEmpty(openQuestions, memoryLine, "No project-linked open questions recorded."),
    "## Recent project updates",
    ...linesOrEmpty(recentProjectUpdates, memoryLine, "No project updates recorded."),
    "## Stale or disputed memory",
    ...linesOrEmpty([...conflicts, ...staleItems.filter((item) => !conflicts.some((conflict) => conflict.memoryId === item.memoryId))], memoryWarningLine, "No stale or disputed project memory found."),
    "## Notes",
    ...projectNotes.slice(0, 10).map((note) => `- ${note.title}: ${note.body.slice(0, 240)}`),
    "## Source quotes",
    ...linesOrEmpty(sourceQuotes, sourceLine, "No source quotes available.")
  ]
    .filter(Boolean)
    .join("\n");

  return {
    project,
    entity: projectEntity ?? null,
    tasks: projectTasks,
    notes: projectNotes,
    documents: projectDocuments,
    memories: projectMemories,
    decisions,
    constraints,
    preferences,
    commitments,
    openQuestions,
    recentProjectUpdates,
    sourceQuotes,
    staleItems,
    conflicts,
    contextPack
  };
}

export async function patchProject(context: AppContext, id: string, input: z.infer<typeof patchProjectSchema>, actor: Actor) {
  const updates: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.goal !== undefined) updates.goal = input.goal;
  if (input.color !== undefined) updates.color = input.color;
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

  await replaceEntityChunks(context, {
    entityId: project.entityId,
    text: projectChunkText(project),
    metadata: { entityType: "project" }
  });
  await enqueuePostIngestJobs(context, [project.entityId]);
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

function projectChunkText(project: {
  name: string;
  description?: string | null | undefined;
  goal?: string | null | undefined;
  status?: string | null | undefined;
  priority?: string | null | undefined;
  dueAt?: string | Date | null | undefined;
}) {
  return composeEntityChunkText([
    `Project: ${project.name}`,
    project.description ? `Description: ${project.description}` : null,
    project.goal ? `Goal: ${project.goal}` : null,
    project.status ? `Status: ${project.status}` : null,
    project.priority ? `Priority: ${project.priority}` : null,
    project.dueAt ? `Due: ${project.dueAt instanceof Date ? project.dueAt.toISOString() : project.dueAt}` : null
  ]);
}

async function loadProjectMemories(context: AppContext, projectId: string) {
  const result = await context.pool.query<ProjectMemoryRow>(
    `select mr.id as "memoryId",
            mr.entity_id as "entityId",
            mr.kind::text as kind,
            mr.title,
            mr.summary,
            mr.body,
            mr.importance::text as importance,
            mr.validity::text as validity,
            mr.stale_after as "staleAfter",
            mr.expires_at as "expiresAt",
            mr.confidence_reason as "confidenceReason",
            mr.updated_at as "updatedAt",
            coalesce(array_remove(array_agg(distinct ms.source_quote), null), array[]::text[]) as "sourceQuotes",
            coalesce(array_remove(array_agg(distinct ms.raw_item_id::text), null), array[]::text[]) as "sourceRawItemIds"
     from memory_records mr
     left join memory_sources ms on ms.memory_record_id = mr.id
     where mr.workspace_id = $1
       and mr.project_id = $2
       and mr.status = 'active'
     group by mr.id
     order by
       case mr.importance
         when 'critical' then 4
         when 'high' then 3
         when 'medium' then 2
         else 1
       end desc,
       mr.updated_at desc
     limit 80`,
    [context.workspaceId, projectId]
  );
  return result.rows;
}

function linesOrEmpty<T>(items: T[], formatter: (item: T) => string, empty: string) {
  return items.length ? items.slice(0, 12).map((item) => `- ${formatter(item)}`) : [`- ${empty}`];
}

function memoryLine(memory: ProjectMemoryRow) {
  return [
    `[${memory.kind}] ${memory.title}`,
    memory.summary ?? memory.body.slice(0, 240),
    memory.importance ? `importance: ${memory.importance}` : null,
    memory.validity !== "current" ? `validity: ${memory.validity}` : null
  ].filter(Boolean).join("; ");
}

function memoryWarningLine(memory: ProjectMemoryRow) {
  return [
    memoryLine(memory),
    memory.confidenceReason ? `reason: ${memory.confidenceReason}` : null
  ].filter(Boolean).join("; ");
}

function sourceLine(source: { memoryUri: string; rawItemUri: string | null; quote: string | null }) {
  return [
    `memory_uri: ${source.memoryUri}`,
    source.rawItemUri ? `raw_item_uri: ${source.rawItemUri}` : null,
    source.quote ? `quote: ${source.quote}` : null
  ].filter(Boolean).join("; ");
}

function buildProjectSourceQuotes(memories: ProjectMemoryRow[]) {
  const sources: Array<{ memoryUri: string; rawItemUri: string | null; quote: string | null }> = [];
  for (const memory of memories) {
    const maxLength = Math.max(memory.sourceQuotes.length, memory.sourceRawItemIds.length);
    for (let index = 0; index < maxLength; index += 1) {
      const rawItemId = memory.sourceRawItemIds[index] ?? null;
      sources.push({
        memoryUri: `memory://${memory.memoryId}`,
        rawItemUri: rawItemId ? `raw-item://${rawItemId}` : null,
        quote: memory.sourceQuotes[index] ?? null
      });
    }
  }
  return sources.filter((source) => source.rawItemUri || source.quote).slice(0, 20);
}

function isProjectMemoryStale(memory: ProjectMemoryRow) {
  if (memory.validity === "stale") return true;
  const staleAfter = dateValue(memory.staleAfter);
  const expiresAt = dateValue(memory.expiresAt);
  const now = Date.now();
  return Boolean((staleAfter && staleAfter.getTime() <= now) || (expiresAt && expiresAt.getTime() <= now));
}

function dateValue(value: Date | string | null) {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}
