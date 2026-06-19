import { entities } from "@personal-context-os/db";
import { entityTypeSchema, type EntityType } from "@personal-context-os/shared";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { createEntityChunks } from "./chunks.js";
import { writeAuditEvent } from "./audit.js";
import type { Actor } from "./types.js";
import type { AppContext } from "./types.js";

const entityListQuerySchema = z.object({
  entity_type: entityTypeSchema.optional(),
  status: z.string().optional(),
  raw_item_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100)
});

export async function createGenericEntity(
  context: AppContext,
  input: {
    entityType: EntityType;
    title: string;
    summary?: string | null;
    body?: string | null;
    status?: string;
    canonical?: Record<string, unknown>;
    customFields?: Record<string, unknown>;
    sourceRawItemId?: string | null;
    confidenceScore?: number;
    chunkText?: string;
  }
) {
  const [entity] = await context.db
    .insert(entities)
    .values({
      workspaceId: context.workspaceId,
      entityType: input.entityType,
      title: input.title,
      summary: input.summary ?? null,
      body: input.body ?? null,
      status: input.status ?? "active",
      canonical: input.canonical ?? {},
      customFields: input.customFields ?? {},
      sourceRawItemId: input.sourceRawItemId ?? null,
      confidenceScore: String(input.confidenceScore ?? 1)
    })
    .returning();

  if (!entity) throw new Error("Failed to create entity");
  await createEntityChunks(context, {
    entityId: entity.id,
    text: input.chunkText ?? [input.title, input.summary, input.body].filter(Boolean).join("\n\n"),
    metadata: { entityType: input.entityType }
  });

  return entity;
}

export async function listEntities(context: AppContext, query: unknown) {
  const filters = entityListQuerySchema.parse(query ?? {});
  const where: SQL[] = [eq(entities.workspaceId, context.workspaceId)];
  if (filters.entity_type) where.push(eq(entities.entityType, filters.entity_type));
  if (filters.status) where.push(eq(entities.status, filters.status));
  if (filters.raw_item_id) where.push(eq(entities.sourceRawItemId, filters.raw_item_id));

  const rows = await context.db
    .select()
    .from(entities)
    .where(and(...where))
    .orderBy(desc(entities.updatedAt))
    .limit(filters.limit);

  return { entities: rows };
}

export async function getEntity(context: AppContext, id: string) {
  const [entity] = await context.db
    .select()
    .from(entities)
    .where(and(eq(entities.workspaceId, context.workspaceId), eq(entities.id, id)))
    .limit(1);

  if (!entity) throw new Error("Entity not found");
  return { entity };
}

export async function deleteEntity(context: AppContext, id: string, actor: Actor) {
  const { entity } = await getEntity(context, id);

  await writeAuditEvent(context, {
    ...actor,
    action: "delete entity",
    entityId: entity.id,
    metadata: { entityType: entity.entityType, title: entity.title }
  });

  await context.db
    .delete(entities)
    .where(and(eq(entities.workspaceId, context.workspaceId), eq(entities.id, id)));

  return { ok: true };
}
