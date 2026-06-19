import { entities, entityEdges, projects, reminders } from "@personal-context-os/db";
import { createReminderSchema, patchReminderSchema } from "@personal-context-os/shared";
import { and, desc, eq, lte, type SQL } from "drizzle-orm";
import { z } from "zod";
import { createGenericEntity } from "./entities.js";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

const reminderListQuerySchema = z.object({
  project_id: z.string().uuid().optional(),
  status: z.string().optional(),
  due_before: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100)
});

export async function createReminder(context: AppContext, input: z.input<typeof createReminderSchema>, actor: Actor) {
  const parsed = createReminderSchema.parse(input);
  const entity = await createGenericEntity(context, {
    entityType: "reminder",
    title: parsed.title,
    status: parsed.status,
    canonical: parsed,
    customFields: {}
  });

  const [reminder] = await context.db
    .insert(reminders)
    .values({
      workspaceId: context.workspaceId,
      entityId: entity.id,
      projectId: parsed.projectId ?? null,
      title: parsed.title,
      remindAt: parsed.remindAt ? new Date(parsed.remindAt) : null,
      recurrenceRule: parsed.recurrenceRule ?? null,
      status: parsed.status
    })
    .returning();

  if (reminder?.projectId) {
    const [project] = await context.db.select({ entityId: projects.entityId }).from(projects).where(eq(projects.id, reminder.projectId)).limit(1);
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

  await writeAuditEvent(context, { ...actor, action: "create entity", entityId: entity.id, metadata: { entityType: "reminder" } });
  return { reminder, entity };
}

export async function listReminders(context: AppContext, query: unknown) {
  const filters = reminderListQuerySchema.parse(query ?? {});
  const where: SQL[] = [eq(reminders.workspaceId, context.workspaceId)];
  if (filters.project_id) where.push(eq(reminders.projectId, filters.project_id));
  if (filters.status) where.push(eq(reminders.status, filters.status));
  if (filters.due_before) where.push(lte(reminders.remindAt, new Date(filters.due_before)));

  const rows = await context.db
    .select()
    .from(reminders)
    .where(and(...where))
    .orderBy(desc(reminders.updatedAt))
    .limit(filters.limit ?? 100);

  return { reminders: rows };
}

export async function getReminder(context: AppContext, id: string) {
  const [reminder] = await context.db
    .select()
    .from(reminders)
    .where(and(eq(reminders.workspaceId, context.workspaceId), eq(reminders.id, id)))
    .limit(1);

  if (!reminder) throw new Error("Reminder not found");
  return { reminder };
}

export async function patchReminder(context: AppContext, id: string, input: z.infer<typeof patchReminderSchema>, actor: Actor) {
  const updates: Partial<typeof reminders.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.projectId !== undefined) updates.projectId = input.projectId;
  if (input.remindAt !== undefined) updates.remindAt = input.remindAt ? new Date(input.remindAt) : null;
  if (input.recurrenceRule !== undefined) updates.recurrenceRule = input.recurrenceRule;
  if (input.status !== undefined) updates.status = input.status;

  const [reminder] = await context.db
    .update(reminders)
    .set(updates)
    .where(and(eq(reminders.workspaceId, context.workspaceId), eq(reminders.id, id)))
    .returning();

  if (!reminder) throw new Error("Reminder not found");

  await context.db
    .update(entities)
    .set({
      title: reminder.title,
      status: reminder.status,
      canonical: reminderCanonical(reminder),
      updatedAt: new Date()
    })
    .where(eq(entities.id, reminder.entityId));

  await writeAuditEvent(context, { ...actor, action: "update entity", entityId: reminder.entityId, metadata: { entityType: "reminder" } });
  return { reminder };
}

export async function deleteReminder(context: AppContext, id: string, actor: Actor) {
  const { reminder } = await getReminder(context, id);

  await writeAuditEvent(context, {
    ...actor,
    action: "delete entity",
    entityId: reminder.entityId,
    metadata: { entityType: "reminder", reminderId: id, title: reminder.title }
  });

  await context.db
    .delete(entities)
    .where(and(eq(entities.workspaceId, context.workspaceId), eq(entities.id, reminder.entityId)));

  return { ok: true };
}

function reminderCanonical(reminder: typeof reminders.$inferSelect) {
  return {
    title: reminder.title,
    projectId: reminder.projectId ?? undefined,
    remindAt: reminder.remindAt?.toISOString(),
    recurrenceRule: reminder.recurrenceRule ?? undefined,
    status: reminder.status
  };
}
