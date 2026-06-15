import { entities, entityEdges, projects, tasks } from "@personal-context-os/db";
import { createTaskSchema, patchTaskSchema, prioritySchema, taskStatusSchema } from "@personal-context-os/shared";
import { and, desc, eq, lte, type SQL } from "drizzle-orm";
import { z } from "zod";
import { createGenericEntity } from "./entities.js";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

const taskListQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  project_id: z.string().uuid().optional(),
  priority: prioritySchema.optional(),
  due_before: z.string().datetime().optional()
});

export function parseTaskFilters(query: unknown) {
  return taskListQuerySchema.parse(query ?? {});
}

export async function createTask(context: AppContext, input: z.input<typeof createTaskSchema>, actor: Actor) {
  const parsed = createTaskSchema.parse(input);
  const entity = await createGenericEntity(context, {
    entityType: "task",
    title: parsed.title,
    summary: parsed.description ?? null,
    body: parsed.description ?? null,
    status: parsed.status,
    canonical: parsed,
    customFields: {}
  });

  const [task] = await context.db
    .insert(tasks)
    .values({
      workspaceId: context.workspaceId,
      entityId: entity.id,
      projectId: parsed.projectId ?? null,
      title: parsed.title,
      description: parsed.description ?? null,
      status: parsed.status,
      priority: parsed.priority,
      dueAt: parsed.dueAt ? new Date(parsed.dueAt) : null,
      scheduledFor: parsed.scheduledFor ? new Date(parsed.scheduledFor) : null,
      estimateMinutes: parsed.estimateMinutes ?? null,
      assignee: parsed.assignee ?? null,
      dependsOnTaskId: parsed.dependsOnTaskId ?? null
    })
    .returning();

  if (task?.projectId) {
    const [project] = await context.db.select({ entityId: projects.entityId }).from(projects).where(eq(projects.id, task.projectId)).limit(1);
    if (project) {
      await context.db.insert(entityEdges).values({
        workspaceId: context.workspaceId,
        fromEntityId: entity.id,
        toEntityId: project.entityId,
        relationType: "belongs_to",
        confidenceScore: "1"
      });
    }
  }

  await writeAuditEvent(context, { ...actor, action: "create entity", entityId: entity.id, metadata: { entityType: "task" } });
  return { task, entity };
}

export async function listTasks(context: AppContext, query: unknown) {
  const filters = parseTaskFilters(query);
  const where: SQL[] = [eq(tasks.workspaceId, context.workspaceId)];
  if (filters.status) where.push(eq(tasks.status, filters.status));
  if (filters.project_id) where.push(eq(tasks.projectId, filters.project_id));
  if (filters.priority) where.push(eq(tasks.priority, filters.priority));
  if (filters.due_before) where.push(lte(tasks.dueAt, new Date(filters.due_before)));

  const rows = await context.db
    .select()
    .from(tasks)
    .where(and(...where))
    .orderBy(desc(tasks.updatedAt))
    .limit(200);

  return { tasks: rows };
}

export async function getTask(context: AppContext, id: string) {
  const [task] = await context.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, context.workspaceId), eq(tasks.id, id)))
    .limit(1);

  if (!task) throw new Error("Task not found");
  return { task };
}

export async function patchTask(context: AppContext, id: string, input: z.infer<typeof patchTaskSchema>, actor: Actor) {
  const updates: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.projectId !== undefined) updates.projectId = input.projectId;
  if (input.status !== undefined) updates.status = input.status;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.dueAt !== undefined) updates.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (input.scheduledFor !== undefined) updates.scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
  if (input.estimateMinutes !== undefined) updates.estimateMinutes = input.estimateMinutes ?? null;
  if (input.assignee !== undefined) updates.assignee = input.assignee ?? null;
  if (input.dependsOnTaskId !== undefined) updates.dependsOnTaskId = input.dependsOnTaskId ?? null;
  if (input.completedAt !== undefined) updates.completedAt = input.completedAt ? new Date(input.completedAt) : null;

  const [task] = await context.db
    .update(tasks)
    .set(updates)
    .where(and(eq(tasks.workspaceId, context.workspaceId), eq(tasks.id, id)))
    .returning();

  if (!task) throw new Error("Task not found");

  await context.db
    .update(entities)
    .set({
      title: task.title,
      summary: task.description ?? null,
      body: task.description ?? null,
      status: task.status,
      updatedAt: new Date()
    })
    .where(eq(entities.id, task.entityId));

  await writeAuditEvent(context, { ...actor, action: "update entity", entityId: task.entityId, metadata: { entityType: "task" } });
  return { task };
}

export async function completeTask(context: AppContext, id: string, actor: Actor) {
  const completedAt = new Date();
  const [task] = await context.db
    .update(tasks)
    .set({ status: "done", completedAt, updatedAt: completedAt })
    .where(and(eq(tasks.workspaceId, context.workspaceId), eq(tasks.id, id)))
    .returning();

  if (!task) throw new Error("Task not found");

  await context.db.update(entities).set({ status: "done", updatedAt: new Date() }).where(eq(entities.id, task.entityId));
  await writeAuditEvent(context, { ...actor, action: "task complete", entityId: task.entityId, metadata: { taskId: id } });
  return { task };
}
