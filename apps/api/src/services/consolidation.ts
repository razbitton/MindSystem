import { memoryConsolidationSchema } from "@personal-context-os/shared";
import { enqueueMemoryConsolidation } from "./queues.js";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

export async function startMemoryConsolidation(context: AppContext, input: unknown, actor: Actor) {
  const parsed = memoryConsolidationSchema.parse(input ?? {});
  await enqueueMemoryConsolidation(context, parsed);
  await writeAuditEvent(context, {
    ...actor,
    action: "memory consolidation queued",
    metadata: parsed
  });
  return { queued: true, ...parsed };
}
