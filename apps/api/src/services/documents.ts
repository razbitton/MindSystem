import { documents, entities } from "@personal-context-os/db";
import { patchDocumentSchema, type CreateDocumentInput } from "@personal-context-os/shared";
import { and, desc, eq } from "drizzle-orm";
import { createGenericEntity } from "./entities.js";
import { writeAuditEvent } from "./audit.js";
import type { z } from "zod";
import type { Actor } from "./types.js";
import type { AppContext } from "./types.js";

export async function createDocument(context: AppContext, input: CreateDocumentInput, actor: Actor) {
  const entity = await createGenericEntity(context, {
    entityType: "document",
    title: input.title,
    summary: input.extractedText?.slice(0, 180) ?? input.objectKey ?? null,
    body: input.extractedText ?? null,
    canonical: input,
    customFields: {}
  });

  const [document] = await context.db
    .insert(documents)
    .values({
      workspaceId: context.workspaceId,
      entityId: entity.id,
      projectId: input.projectId ?? null,
      title: input.title,
      objectKey: input.objectKey ?? null,
      mimeType: input.mimeType ?? null,
      extractedText: input.extractedText ?? null
    })
    .returning();

  await writeAuditEvent(context, { ...actor, action: "create entity", entityId: entity.id, metadata: { entityType: "document" } });
  return { document, entity };
}

export async function listDocuments(context: AppContext) {
  const rows = await context.db
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, context.workspaceId))
    .orderBy(desc(documents.updatedAt))
    .limit(200);

  return { documents: rows };
}

export async function getDocument(context: AppContext, id: string) {
  const [document] = await context.db
    .select()
    .from(documents)
    .where(and(eq(documents.workspaceId, context.workspaceId), eq(documents.id, id)))
    .limit(1);

  if (!document) throw new Error("Document not found");
  return { document };
}

export async function patchDocument(context: AppContext, id: string, input: z.infer<typeof patchDocumentSchema>, actor: Actor) {
  const updates: Partial<typeof documents.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.projectId !== undefined) updates.projectId = input.projectId;
  if (input.objectKey !== undefined) updates.objectKey = input.objectKey;
  if (input.mimeType !== undefined) updates.mimeType = input.mimeType;
  if (input.extractedText !== undefined) updates.extractedText = input.extractedText;

  const [document] = await context.db
    .update(documents)
    .set(updates)
    .where(and(eq(documents.workspaceId, context.workspaceId), eq(documents.id, id)))
    .returning();

  if (!document) throw new Error("Document not found");

  await context.db
    .update(entities)
    .set({
      title: document.title,
      summary: document.extractedText?.slice(0, 180) ?? document.objectKey ?? null,
      body: document.extractedText ?? null,
      updatedAt: new Date()
    })
    .where(eq(entities.id, document.entityId));

  await writeAuditEvent(context, { ...actor, action: "update entity", entityId: document.entityId, metadata: { entityType: "document" } });
  return { document };
}

export async function deleteDocument(context: AppContext, id: string, actor: Actor) {
  const { document } = await getDocument(context, id);

  await writeAuditEvent(context, {
    ...actor,
    action: "delete entity",
    entityId: document.entityId,
    metadata: { entityType: "document", documentId: id, title: document.title }
  });

  await context.db
    .delete(entities)
    .where(and(eq(entities.workspaceId, context.workspaceId), eq(entities.id, document.entityId)));

  return { ok: true };
}
