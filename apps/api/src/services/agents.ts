import { agentTokens, auditEvents, agentRuns } from "@personal-context-os/db";
import type { AgentScope, CreateAgentTokenInput } from "@personal-context-os/shared";
import { and, desc, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

export function hashAgentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAgentToken(
  context: AppContext,
  input: Omit<CreateAgentTokenInput, "scopes"> & { scopes: AgentScope[] },
  actor: Actor
) {
  const plaintext = `pcos_${randomBytes(32).toString("base64url")}`;
  const [token] = await context.db
    .insert(agentTokens)
    .values({
      workspaceId: context.workspaceId,
      name: input.name,
      tokenHash: hashAgentToken(plaintext),
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
    })
    .returning();

  await writeAuditEvent(context, {
    ...actor,
    action: "token created",
    metadata: { tokenId: token?.id, scopes: input.scopes }
  });

  return {
    token,
    plaintextToken: plaintext
  };
}

export async function listAgentState(context: AppContext) {
  const [tokens, runs, audits] = await Promise.all([
    context.db
      .select({
        id: agentTokens.id,
        name: agentTokens.name,
        scopes: agentTokens.scopes,
        createdAt: agentTokens.createdAt,
        lastUsedAt: agentTokens.lastUsedAt,
        expiresAt: agentTokens.expiresAt,
        revokedAt: agentTokens.revokedAt
      })
      .from(agentTokens)
      .where(eq(agentTokens.workspaceId, context.workspaceId))
      .orderBy(desc(agentTokens.createdAt)),
    context.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.workspaceId, context.workspaceId))
      .orderBy(desc(agentRuns.startedAt))
      .limit(25),
    context.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, context.workspaceId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(25)
  ]);

  return { tokens, runs, auditEvents: audits, mcpServerUrl: context.env.MCP_SERVER_URL };
}

export async function revokeAgentToken(context: AppContext, id: string, actor: Actor) {
  const [token] = await context.db
    .update(agentTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(agentTokens.workspaceId, context.workspaceId), eq(agentTokens.id, id)))
    .returning({
      id: agentTokens.id,
      name: agentTokens.name,
      scopes: agentTokens.scopes,
      createdAt: agentTokens.createdAt,
      lastUsedAt: agentTokens.lastUsedAt,
      expiresAt: agentTokens.expiresAt,
      revokedAt: agentTokens.revokedAt
    });

  if (!token) throw new Error("Agent token not found");
  await writeAuditEvent(context, { ...actor, action: "token revoked", metadata: { tokenId: id, name: token.name } });
  return { token };
}

export async function deleteAgentToken(context: AppContext, id: string, actor: Actor) {
  const [token] = await context.db
    .delete(agentTokens)
    .where(and(eq(agentTokens.workspaceId, context.workspaceId), eq(agentTokens.id, id)))
    .returning({ id: agentTokens.id, name: agentTokens.name });

  if (!token) throw new Error("Agent token not found");
  await writeAuditEvent(context, { ...actor, action: "token deleted", metadata: { tokenId: id, name: token.name } });
  return { ok: true };
}

export async function deleteAgentRun(context: AppContext, id: string) {
  const [run] = await context.db
    .delete(agentRuns)
    .where(and(eq(agentRuns.workspaceId, context.workspaceId), eq(agentRuns.id, id)))
    .returning({ id: agentRuns.id });

  if (!run) throw new Error("Agent run not found");
  return { ok: true };
}

export async function clearAgentRuns(context: AppContext) {
  const result = await context.pool.query(
    `delete from agent_runs
     where workspace_id = $1`,
    [context.workspaceId]
  );
  return { ok: true, deletedAgentRuns: result.rowCount ?? 0 };
}
