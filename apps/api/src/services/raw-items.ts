import { entities, rawItems } from "@personal-context-os/db";
import { clearRawItemsSchema, deleteRawItemSchema, sourceTypeSchema } from "@personal-context-os/shared";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

const rawItemListQuerySchema = z.object({
  source_type: sourceTypeSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).default(50)
});

export async function listRawItems(context: AppContext, query: unknown) {
  const filters = rawItemListQuerySchema.parse(query ?? {});
  const where: SQL[] = [eq(rawItems.workspaceId, context.workspaceId)];
  if (filters.source_type) where.push(eq(rawItems.sourceType, filters.source_type));

  const rows = await context.db
    .select()
    .from(rawItems)
    .where(and(...where))
    .orderBy(desc(rawItems.createdAt))
    .limit(filters.limit);

  return { rawItems: rows };
}

export async function getRawItem(context: AppContext, id: string) {
  const [rawItem] = await context.db
    .select()
    .from(rawItems)
    .where(and(eq(rawItems.workspaceId, context.workspaceId), eq(rawItems.id, id)))
    .limit(1);

  if (!rawItem) throw new Error("Raw item not found");
  return { rawItem };
}

export async function deleteRawItem(context: AppContext, id: string, input: unknown, actor: Actor) {
  const parsed = deleteRawItemSchema.parse(input ?? {});
  const { rawItem } = await getRawItem(context, id);

  await writeAuditEvent(context, {
    ...actor,
    action: "delete raw item",
    rawItemId: rawItem.id,
    metadata: {
      rawItemId: rawItem.id,
      sourceType: rawItem.sourceType,
      deleteDerivedEntities: parsed.deleteDerivedEntities
    }
  });

  let deletedDerivedEntities = 0;
  if (parsed.deleteDerivedEntities) {
    const deleted = await context.db
      .delete(entities)
      .where(and(eq(entities.workspaceId, context.workspaceId), eq(entities.sourceRawItemId, rawItem.id)))
      .returning({ id: entities.id });
    deletedDerivedEntities = deleted.length;
  }

  const [deletedRawItem] = await context.db
    .delete(rawItems)
    .where(and(eq(rawItems.workspaceId, context.workspaceId), eq(rawItems.id, id)))
    .returning({ id: rawItems.id });

  if (!deletedRawItem) throw new Error("Raw item not found");
  return { ok: true, deletedRawItems: 1, deletedDerivedEntities };
}

export async function clearRawItems(context: AppContext, input: unknown, actor: Actor) {
  const parsed = clearRawItemsSchema.parse(input ?? {});
  let deletedDerivedEntities = 0;

  if (parsed.deleteDerivedEntities) {
    const result = await context.pool.query(
      `delete from entities
       where workspace_id = $1 and source_raw_item_id is not null`,
      [context.workspaceId]
    );
    deletedDerivedEntities = result.rowCount ?? 0;
  }

  const result = await context.pool.query(
    `delete from raw_items
     where workspace_id = $1`,
    [context.workspaceId]
  );
  const deletedRawItems = result.rowCount ?? 0;

  await writeAuditEvent(context, {
    ...actor,
    action: "clear raw items",
    metadata: { deletedRawItems, deletedDerivedEntities, deleteDerivedEntities: parsed.deleteDerivedEntities }
  });

  return { ok: true, deletedRawItems, deletedDerivedEntities };
}
