import { agentTokens } from "@personal-context-os/db";
import { hasScope, type AgentScope } from "@personal-context-os/shared";
import { and, eq, isNull, or, gt } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { DbClient } from "@personal-context-os/db";

export interface AgentIdentity {
  id: string;
  workspaceId: string;
  name: string;
  scopes: string[];
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function requireToolScope(scopes: readonly string[], required: AgentScope) {
  if (!hasScope(scopes, required)) {
    throw new Error(`Missing required scope: ${required}`);
  }
}

export async function authenticateAgent(db: DbClient, bearerToken: string): Promise<AgentIdentity> {
  const tokenHash = hashToken(bearerToken);
  const [token] = await db
    .select()
    .from(agentTokens)
    .where(
      and(
        eq(agentTokens.tokenHash, tokenHash),
        isNull(agentTokens.revokedAt),
        or(isNull(agentTokens.expiresAt), gt(agentTokens.expiresAt, new Date()))
      )
    )
    .limit(1);

  if (!token) throw new Error("Invalid or expired agent token");

  await db.update(agentTokens).set({ lastUsedAt: new Date() }).where(eq(agentTokens.id, token.id));

  return {
    id: token.id,
    workspaceId: token.workspaceId,
    name: token.name,
    scopes: token.scopes
  };
}
