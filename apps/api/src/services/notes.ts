import { entities, notes } from "@personal-context-os/db";
import { createNoteSchema, patchNoteSchema, type CreateNoteInput } from "@personal-context-os/shared";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { composeEntityChunkText, replaceEntityChunks } from "./chunks.js";
import { createGenericEntity } from "./entities.js";
import { enqueuePostIngestJobs } from "./queues.js";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

const noteListQuerySchema = z.object({
  project_id: z.string().uuid().optional()
});

export async function createNote(context: AppContext, input: CreateNoteInput, actor: Actor) {
  const entity = await createGenericEntity(context, {
    entityType: "note",
    title: input.title,
    summary: input.body.slice(0, 180),
    body: input.body,
    canonical: input,
    customFields: {},
    chunkText: noteChunkText(input)
  });

  const [note] = await context.db
    .insert(notes)
    .values({
      workspaceId: context.workspaceId,
      entityId: entity.id,
      projectId: input.projectId ?? null,
      title: input.title,
      body: input.body
    })
    .returning();

  await writeAuditEvent(context, { ...actor, action: "create entity", entityId: entity.id, metadata: { entityType: "note" } });
  await enqueuePostIngestJobs(context, [entity.id]);
  return { note, entity };
}

export async function listNotes(context: AppContext, query: unknown) {
  const filters = noteListQuerySchema.parse(query ?? {});
  const where: SQL[] = [eq(notes.workspaceId, context.workspaceId)];
  if (filters.project_id) where.push(eq(notes.projectId, filters.project_id));

  const rows = await context.db
    .select()
    .from(notes)
    .where(and(...where))
    .orderBy(desc(notes.updatedAt))
    .limit(200);

  return { notes: rows };
}

export async function getNote(context: AppContext, id: string) {
  const [note] = await context.db
    .select()
    .from(notes)
    .where(and(eq(notes.workspaceId, context.workspaceId), eq(notes.id, id)))
    .limit(1);

  if (!note) throw new Error("Note not found");
  return { note };
}

export async function patchNote(context: AppContext, id: string, input: z.infer<typeof patchNoteSchema>, actor: Actor) {
  const updates: Partial<typeof notes.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.body !== undefined) updates.body = input.body;
  if (input.projectId !== undefined) updates.projectId = input.projectId;

  const [note] = await context.db
    .update(notes)
    .set(updates)
    .where(and(eq(notes.workspaceId, context.workspaceId), eq(notes.id, id)))
    .returning();

  if (!note) throw new Error("Note not found");

  await context.db
    .update(entities)
    .set({
      title: note.title,
      summary: note.body.slice(0, 180),
      body: note.body,
      updatedAt: new Date()
    })
    .where(eq(entities.id, note.entityId));

  await replaceEntityChunks(context, {
    entityId: note.entityId,
    text: noteChunkText(note),
    metadata: { entityType: "note" }
  });
  await enqueuePostIngestJobs(context, [note.entityId]);
  await writeAuditEvent(context, { ...actor, action: "update entity", entityId: note.entityId, metadata: { entityType: "note" } });
  return { note };
}

export async function deleteNote(context: AppContext, id: string, actor: Actor) {
  const { note } = await getNote(context, id);

  await writeAuditEvent(context, {
    ...actor,
    action: "delete entity",
    entityId: note.entityId,
    metadata: { entityType: "note", noteId: id, title: note.title }
  });

  await context.db
    .delete(entities)
    .where(and(eq(entities.workspaceId, context.workspaceId), eq(entities.id, note.entityId)));

  return { ok: true };
}

function noteChunkText(note: { title: string; body: string; projectId?: string | null | undefined }) {
  return composeEntityChunkText([
    `Note: ${note.title}`,
    note.projectId ? `Project ID: ${note.projectId}` : null,
    note.body
  ]);
}
