import { projectSchemaOverrides, schemaDefinitions } from "@personal-context-os/db";
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "./types.js";

export async function listSchemaDefinitions(context: AppContext) {
  const definitions = await context.db
    .select()
    .from(schemaDefinitions)
    .where(eq(schemaDefinitions.workspaceId, context.workspaceId))
    .orderBy(desc(schemaDefinitions.createdAt));

  return { definitions };
}

export async function deleteSchemaDefinition(context: AppContext, id: string) {
  const [definition] = await context.db
    .delete(schemaDefinitions)
    .where(and(eq(schemaDefinitions.workspaceId, context.workspaceId), eq(schemaDefinitions.id, id)))
    .returning({ id: schemaDefinitions.id });

  if (!definition) throw new Error("Schema definition not found");
  return { ok: true };
}

export async function clearSchemaDefinitions(context: AppContext) {
  const result = await context.pool.query(
    `delete from schema_definitions
     where workspace_id = $1`,
    [context.workspaceId]
  );
  return { ok: true, deletedSchemaDefinitions: result.rowCount ?? 0 };
}

export async function listProjectSchemaOverrides(context: AppContext) {
  const overrides = await context.db
    .select()
    .from(projectSchemaOverrides)
    .where(eq(projectSchemaOverrides.workspaceId, context.workspaceId))
    .orderBy(desc(projectSchemaOverrides.createdAt));

  return { overrides };
}

export async function deleteProjectSchemaOverride(context: AppContext, id: string) {
  const [override] = await context.db
    .delete(projectSchemaOverrides)
    .where(and(eq(projectSchemaOverrides.workspaceId, context.workspaceId), eq(projectSchemaOverrides.id, id)))
    .returning({ id: projectSchemaOverrides.id });

  if (!override) throw new Error("Project schema override not found");
  return { ok: true };
}

export async function clearProjectSchemaOverrides(context: AppContext) {
  const result = await context.pool.query(
    `delete from project_schema_overrides
     where workspace_id = $1`,
    [context.workspaceId]
  );
  return { ok: true, deletedProjectSchemaOverrides: result.rowCount ?? 0 };
}
