import { retrievalLogs } from "@personal-context-os/db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "./types.js";

const retrievalLogListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(100)
});

export async function listRetrievalLogs(context: AppContext, query: unknown) {
  const filters = retrievalLogListQuerySchema.parse(query ?? {});
  const logs = await context.db
    .select()
    .from(retrievalLogs)
    .where(eq(retrievalLogs.workspaceId, context.workspaceId))
    .orderBy(desc(retrievalLogs.createdAt))
    .limit(filters.limit);

  return { logs };
}

export async function deleteRetrievalLog(context: AppContext, id: string) {
  const [log] = await context.db
    .delete(retrievalLogs)
    .where(and(eq(retrievalLogs.workspaceId, context.workspaceId), eq(retrievalLogs.id, id)))
    .returning({ id: retrievalLogs.id });

  if (!log) throw new Error("Retrieval log not found");
  return { ok: true };
}

export async function clearRetrievalLogs(context: AppContext) {
  const result = await context.pool.query(
    `delete from retrieval_logs
     where workspace_id = $1`,
    [context.workspaceId]
  );
  return { ok: true, deletedRetrievalLogs: result.rowCount ?? 0 };
}
