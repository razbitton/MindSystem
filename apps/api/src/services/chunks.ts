import { chunks } from "@personal-context-os/db";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "./types.js";

const CHUNK_SIZE = 1800;

export async function createEntityChunks(
  context: AppContext,
  input: {
    entityId: string;
    text: string;
    metadata?: Record<string, unknown>;
  }
) {
  const pieces = splitChunkText(input.text);
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

export async function replaceEntityChunks(
  context: AppContext,
  input: {
    entityId: string;
    text: string;
    metadata?: Record<string, unknown>;
  }
) {
  await context.db
    .delete(chunks)
    .where(and(eq(chunks.workspaceId, context.workspaceId), eq(chunks.entityId, input.entityId)));

  return createEntityChunks(context, input);
}

export function composeEntityChunkText(parts: Array<string | number | Date | null | undefined>) {
  return parts
    .map((part) => {
      if (part instanceof Date) return part.toISOString();
      if (typeof part === "number") return String(part);
      return part?.trim();
    })
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

function splitChunkText(text: string) {
  const normalized = text.trim();
  if (!normalized) return [];
  return normalized.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, "g")) ?? [normalized];
}
