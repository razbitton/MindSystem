import { dailyObjectiveOverrides, entities, entityEdges, projects, tasks } from "@personal-context-os/db";
import {
  createTaskSchema,
  localDateSchema,
  patchTaskSchema,
  prioritySchema,
  setDailyObjectiveSchema,
  taskKindSchema,
  taskStatusSchema
} from "@personal-context-os/shared";
import { and, desc, eq, lte, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { createGenericEntity } from "./entities.js";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

const taskListQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  project_id: z.string().uuid().optional(),
  priority: prioritySchema.optional(),
  due_before: z.string().datetime().optional(),
  objective_date: localDateSchema.optional()
});
type TaskKind = z.infer<typeof taskKindSchema>;
type ParsedCreateTask = z.infer<typeof createTaskSchema>;
type ParsedPatchTask = z.infer<typeof patchTaskSchema>;

export function parseTaskFilters(query: unknown) {
  return taskListQuerySchema.parse(query ?? {});
}

export async function createTask(context: AppContext, input: z.input<typeof createTaskSchema>, actor: Actor) {
  const parsed = sanitizeCreateTask(createTaskSchema.parse(input));
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
      kind: parsed.kind,
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

  if (filters.objective_date) {
    const rows = await context.db
      .select({
        task: tasks,
        objectiveState: dailyObjectiveOverrides.state
      })
      .from(tasks)
      .leftJoin(
        dailyObjectiveOverrides,
        and(
          eq(dailyObjectiveOverrides.workspaceId, tasks.workspaceId),
          eq(dailyObjectiveOverrides.taskId, tasks.id),
          eq(dailyObjectiveOverrides.localDate, filters.objective_date)
        )
      )
      .where(and(...where))
      .orderBy(desc(tasks.updatedAt))
      .limit(200);

    return {
      tasks: rows.map((row) => ({
        ...row.task,
        objectiveState: row.objectiveState,
        objective_state: row.objectiveState,
        isPinned: row.objectiveState === "pinned"
      }))
    };
  }

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
    .where(and(eq(tasks.workspaceId, context.workspaceId), taskIdentityWhere(id)))
    .limit(1);

  if (!task) throw new Error("Task not found");
  return { task };
}

export async function patchTask(context: AppContext, id: string, input: ParsedPatchTask, actor: Actor) {
  const { task: existingTask } = await getTask(context, id);
  const updates: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  const nextKind = taskKindValue(input.kind ?? existingTask.kind);

  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.projectId !== undefined) updates.projectId = input.projectId;
  if (input.kind !== undefined) updates.kind = taskKindValue(input.kind);
  if (input.status !== undefined) updates.status = input.status;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.dueAt !== undefined) updates.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (input.scheduledFor !== undefined) updates.scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
  if (input.estimateMinutes !== undefined) updates.estimateMinutes = input.estimateMinutes ?? null;
  if (input.assignee !== undefined) updates.assignee = input.assignee ?? null;
  if (input.dependsOnTaskId !== undefined) updates.dependsOnTaskId = input.dependsOnTaskId ?? null;
  if (input.completedAt !== undefined) updates.completedAt = input.completedAt ? new Date(input.completedAt) : null;

  if (nextKind === "ongoing") {
    updates.kind = "ongoing";
    updates.dueAt = null;
    updates.scheduledFor = null;
    updates.estimateMinutes = null;
    updates.completedAt = null;
    if (updates.status === "done" || (updates.status === undefined && existingTask.status === "done")) {
      updates.status = "todo";
    }
  }

  const [task] = await context.db
    .update(tasks)
    .set(updates)
    .where(and(eq(tasks.workspaceId, context.workspaceId), taskIdentityWhere(id)))
    .returning();

  if (!task) throw new Error("Task not found");

  await context.db
    .update(entities)
    .set({
      title: task.title,
      summary: task.description ?? null,
      body: task.description ?? null,
      status: task.status,
      canonical: taskCanonical(task),
      updatedAt: new Date()
    })
    .where(eq(entities.id, task.entityId));

  await writeAuditEvent(context, { ...actor, action: "update entity", entityId: task.entityId, metadata: { entityType: "task" } });
  return { task };
}

export async function completeTask(context: AppContext, id: string, actor: Actor) {
  const { task: existingTask } = await getTask(context, id);
  if (taskKindValue(existingTask.kind) === "ongoing") {
    throw new Error("Ongoing tasks cannot be completed.");
  }

  const completedAt = new Date();
  const [task] = await context.db
    .update(tasks)
    .set({ status: "done", completedAt, updatedAt: completedAt })
    .where(and(eq(tasks.workspaceId, context.workspaceId), taskIdentityWhere(id)))
    .returning();

  if (!task) throw new Error("Task not found");

  await context.db
    .update(entities)
    .set({ status: "done", canonical: taskCanonical(task), updatedAt: new Date() })
    .where(eq(entities.id, task.entityId));
  await writeAuditEvent(context, { ...actor, action: "task complete", entityId: task.entityId, metadata: { taskId: task.id } });
  return { task };
}

export async function setDailyObjective(context: AppContext, id: string, input: unknown, actor: Actor) {
  const parsed = setDailyObjectiveSchema.parse(input);
  const { task } = await getTask(context, id);

  if (parsed.action === "clear") {
    await context.pool.query(
      `delete from daily_objective_overrides
       where workspace_id = $1 and task_id = $2 and local_date = $3::date`,
      [context.workspaceId, task.id, parsed.date]
    );
  } else if (parsed.action === "snooze") {
    await upsertDailyObjectiveOverride(context, task.id, parsed.date, "dismissed");
    await upsertDailyObjectiveOverride(context, task.id, parsed.targetDate!, "pinned");
  } else {
    await upsertDailyObjectiveOverride(context, task.id, parsed.date, "pinned");
  }

  await writeAuditEvent(context, {
    ...actor,
    action: "set daily objective",
    entityId: task.entityId,
    metadata: {
      taskId: task.id,
      date: parsed.date,
      action: parsed.action,
      targetDate: parsed.targetDate
    }
  });

  return { ok: true, task, date: parsed.date, action: parsed.action, targetDate: parsed.targetDate ?? null };
}

export async function deleteTask(context: AppContext, id: string, actor: Actor) {
  const { task } = await getTask(context, id);

  await writeAuditEvent(context, {
    ...actor,
    action: "delete entity",
    entityId: task.entityId,
    metadata: { entityType: "task", taskId: id, title: task.title }
  });

  await context.db
    .delete(entities)
    .where(and(eq(entities.workspaceId, context.workspaceId), eq(entities.id, task.entityId)));

  return { ok: true };
}

function taskIdentityWhere(id: string): SQL {
  return or(eq(tasks.id, id), eq(tasks.entityId, id)) ?? eq(tasks.id, id);
}

async function upsertDailyObjectiveOverride(
  context: AppContext,
  taskId: string,
  localDate: string,
  state: "pinned" | "dismissed"
) {
  await context.pool.query(
    `insert into daily_objective_overrides (workspace_id, task_id, local_date, state, updated_at)
     values ($1, $2, $3::date, $4::daily_objective_state, now())
     on conflict (workspace_id, task_id, local_date)
     do update set state = excluded.state, updated_at = now()`,
    [context.workspaceId, taskId, localDate, state]
  );
}

function taskCanonical(task: typeof tasks.$inferSelect) {
  return {
    title: task.title,
    description: task.description ?? undefined,
    projectId: task.projectId ?? undefined,
    kind: taskKindValue(task.kind),
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString(),
    scheduledFor: task.scheduledFor?.toISOString(),
    estimateMinutes: task.estimateMinutes ?? undefined,
    assignee: task.assignee ?? undefined,
    dependsOnTaskId: task.dependsOnTaskId ?? undefined,
    completedAt: task.completedAt?.toISOString()
  };
}

function sanitizeCreateTask(task: ParsedCreateTask): ParsedCreateTask {
  const kind = taskKindValue(task.kind);
  if (kind !== "ongoing") return { ...task, kind };

  return {
    ...task,
    kind,
    status: task.status === "done" ? "todo" : task.status,
    dueAt: null,
    scheduledFor: null,
    estimateMinutes: null
  };
}

function taskKindValue(value: unknown): TaskKind {
  return value === "ongoing" ? "ongoing" : "one_off";
}
