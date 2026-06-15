import { entities } from "@personal-context-os/db";
import type { EntityType } from "@personal-context-os/shared";
import { createEntityChunks } from "./chunks.js";
import type { AppContext } from "./types.js";

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
