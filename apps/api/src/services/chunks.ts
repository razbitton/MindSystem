import { chunks } from "@personal-context-os/db";
import type { AppContext } from "./types.js";

export async function createEntityChunks(
  context: AppContext,
  input: {
    entityId: string;
    text: string;
    metadata?: Record<string, unknown>;
  }
) {
  const chunkSize = 1800;
  const pieces = input.text.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, "g")) ?? [input.text];
  if (pieces.length === 0) return [];

  return context.db
    .insert(chunks)
    .values(
      pieces.map((piece, index) => ({
        workspaceId: context.workspaceId,
        entityId: input.entityId,
        chunkText: piece,
        chunkIndex: index,
        metadata: input.metadata ?? {}
      }))
    )
    .returning();
}
