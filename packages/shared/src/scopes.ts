import { z } from "zod";

export const agentScopeValues = [
  "memory:read",
  "memory:write",
  "projects:read",
  "projects:write",
  "tasks:read",
  "tasks:write",
  "documents:read",
  "documents:write",
  "admin"
] as const;

export const agentScopeSchema = z.enum(agentScopeValues);
export type AgentScope = z.infer<typeof agentScopeSchema>;

export function hasScope(grantedScopes: readonly string[], required: AgentScope): boolean {
  return grantedScopes.includes("admin") || grantedScopes.includes(required);
}

export function assertScope(grantedScopes: readonly string[], required: AgentScope): void {
  if (!hasScope(grantedScopes, required)) {
    throw new Error(`Missing required scope: ${required}`);
  }
}
