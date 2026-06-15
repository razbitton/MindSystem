import { documents } from "@personal-context-os/db";
import type { CreateDocumentInput } from "@personal-context-os/shared";
import { and, desc, eq } from "drizzle-orm";
import { createGenericEntity } from "./entities.js";
import { writeAuditEvent } from "./audit.js";
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
