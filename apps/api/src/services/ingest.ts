import { OpenAICodexNormalizer, OpenAINormalizer } from "@personal-context-os/ai";
import {
  entities,
  entityEdges,
  notes,
  projects,
  rawItems,
  reminders,
  reviewQueue,
  tasks
} from "@personal-context-os/db";
import type { IngestFreeTextInput, NormalizerOutput } from "@personal-context-os/shared";
import { normalizerOutputSchema, sourceReliabilityDefaults, type AiOperationDecision, type AiOperationType } from "@personal-context-os/shared";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { decideWorkspaceAiOperation, writeAiActivity } from "./ai-operations.js";
import { createGenericEntity } from "./entities.js";
import { buildIngestPlan } from "./ingest-plan.js";
import { findEntityByTitle, findProjectByName } from "./entity-resolution.js";
import { resolveOpenAICodexAccessToken } from "./openai-codex.js";
import { enqueuePostIngestJobs } from "./queues.js";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

type NormalizedEntityItem = {
  title: string;
  confidence: number;
  customFields: Record<string, unknown>;
  body?: string | undefined;
  importance?: string | undefined;
  priority?: string | undefined;
  dueAt?: string | null | undefined;
  projectTitle?: string | undefined;
};

export async function ingestFreeText(context: AppContext, input: IngestFreeTextInput, actor: Actor) {
  const [rawItem] = await context.db
    .insert(rawItems)
    .values({
      workspaceId: context.workspaceId,
      sourceType: input.sourceType,
      authorId: context.userId,
      rawText: input.text,
      rawPayload: input.rawPayload,
      contentHash: createHash("sha256").update(input.text).digest("hex")
    })
    .returning();

  if (!rawItem) throw new Error("Failed to save raw item");

  await writeAuditEvent(context, {
    ...actor,
    action: "ingest",
    rawItemId: rawItem.id,
    metadata: { sourceType: input.sourceType }
  });

  const projectHint = input.projectId ? await getProjectName(context, input.projectId) : undefined;
  const normalizer = createNormalizer(context);
  const normalized = normalizerOutputSchema.parse(await normalizer.normalize(projectHint ? { text: input.text, projectHint } : { text: input.text }));
  const plan = buildIngestPlan(normalized);
  const createdEntities: unknown[] = [];
  const reviewItems: unknown[] = [];
  const activityEntries: unknown[] = [];
  const projectTitleToId = new Map<string, string>();
  const entityTitleToId = new Map<string, string>();
  const bulkCount = normalizedItemCount(normalized);

  for (const project of normalized.projects) {
    const decision = await decideIngestItem(context, input, "create_memory", project, bulkCount);
    if (decision === "reject_or_ignore") {
      activityEntries.push(await logIgnoredIngestItem(context, actor, rawItem.id, "project", project, decision, input));
      continue;
    }
    if (decision === "needs_review") {
      reviewItems.push(await createReviewItem(context, rawItem.id, "low_confidence_project", "create_project", project));
      continue;
    }

    const existing = await findProjectByName(context, project.title);
    if (existing) {
      projectTitleToId.set(project.title.toLowerCase(), existing.id);
      continue;
    }

    const entity = await createGenericEntity(context, {
      entityType: "project",
      title: project.title,
      summary: project.description ?? project.goal ?? null,
      body: project.description ?? null,
      status: project.status,
      canonical: project,
      customFields: project.customFields,
      sourceRawItemId: rawItem.id,
      confidenceScore: project.confidence
    });
    const [typed] = await context.db
      .insert(projects)
      .values({
        workspaceId: context.workspaceId,
        entityId: entity.id,
        name: project.title,
        description: project.description ?? null,
        goal: project.goal ?? null,
        color: project.color ?? null,
        status: project.status,
        priority: project.priority,
        dueAt: project.dueAt ? new Date(project.dueAt) : null,
        ownerUserId: context.userId
      })
      .returning();
    if (typed) {
      projectTitleToId.set(project.title.toLowerCase(), typed.id);
      entityTitleToId.set(`project:${project.title.toLowerCase()}`, entity.id);
      createdEntities.push({ entity, project: typed });
      await writeAuditEvent(context, { ...actor, action: "create entity", entityId: entity.id, rawItemId: rawItem.id });
      activityEntries.push(await logAppliedIngestItem(context, actor, rawItem.id, entity.id, "create_memory", "project", project, decision, input.sourceType));
    }
  }

  for (const task of normalized.tasks) {
    const decision = await decideIngestItem(context, input, "create_task", task, bulkCount);
    if (decision === "reject_or_ignore") {
      activityEntries.push(await logIgnoredIngestItem(context, actor, rawItem.id, "task", task, decision, input));
      continue;
    }
    if (decision === "needs_review") {
      reviewItems.push(await createReviewItem(context, rawItem.id, "low_confidence_task", "create_task", task));
      continue;
    }
    const taskKind = task.kind === "ongoing" ? "ongoing" : "one_off";
    const taskStatus = taskKind === "ongoing" && task.status === "done" ? "todo" : task.status;
    const canonicalTask = {
      ...task,
      kind: taskKind,
      status: taskStatus,
      dueAt: taskKind === "ongoing" ? undefined : task.dueAt,
      scheduledFor: taskKind === "ongoing" ? undefined : task.scheduledFor,
      estimateMinutes: taskKind === "ongoing" ? undefined : task.estimateMinutes
    };
    const projectId = await resolveProjectId(context, input.projectId, task.projectTitle, projectTitleToId);
    const entity = await createGenericEntity(context, {
      entityType: "task",
      title: task.title,
      summary: task.description ?? null,
      body: task.description ?? null,
      status: taskStatus,
      canonical: canonicalTask,
      customFields: task.customFields,
      sourceRawItemId: rawItem.id,
      confidenceScore: task.confidence
    });
    const [typed] = await context.db
      .insert(tasks)
      .values({
        workspaceId: context.workspaceId,
        entityId: entity.id,
        projectId,
        title: task.title,
        description: task.description ?? null,
        kind: taskKind,
        status: taskStatus,
        priority: task.priority,
        dueAt: taskKind === "ongoing" || !task.dueAt ? null : new Date(task.dueAt),
        scheduledFor: taskKind === "ongoing" || !task.scheduledFor ? null : new Date(task.scheduledFor),
        estimateMinutes: taskKind === "ongoing" ? null : task.estimateMinutes ?? null,
        assignee: task.assignee ?? null
      })
      .returning();
    if (typed) {
      createdEntities.push({ entity, task: typed });
      entityTitleToId.set(`task:${task.title.toLowerCase()}`, entity.id);
      await linkToProject(context, entity.id, projectId, task.confidence);
      await writeAuditEvent(context, { ...actor, action: "create entity", entityId: entity.id, rawItemId: rawItem.id });
      activityEntries.push(await logAppliedIngestItem(context, actor, rawItem.id, entity.id, "create_task", "task", task, decision, input.sourceType));
    }
  }

  for (const note of normalized.notes) {
    const decision = await decideIngestItem(context, input, "create_memory", note, bulkCount);
    if (decision === "reject_or_ignore") {
      activityEntries.push(await logIgnoredIngestItem(context, actor, rawItem.id, "note", note, decision, input));
      continue;
    }
    if (decision === "needs_review") {
      reviewItems.push(await createReviewItem(context, rawItem.id, "low_confidence_note", "create_note", note));
      continue;
    }
    const projectId = await resolveProjectId(context, input.projectId, note.projectTitle, projectTitleToId);
    const entity = await createGenericEntity(context, {
      entityType: "note",
      title: note.title,
      summary: note.body.slice(0, 180),
      body: note.body,
      status: "active",
      canonical: note,
      customFields: note.customFields,
      sourceRawItemId: rawItem.id,
      confidenceScore: note.confidence
    });
    const [typed] = await context.db
      .insert(notes)
      .values({
        workspaceId: context.workspaceId,
        entityId: entity.id,
        projectId,
        title: note.title,
        body: note.body
      })
      .returning();
    if (typed) {
      createdEntities.push({ entity, note: typed });
      entityTitleToId.set(`note:${note.title.toLowerCase()}`, entity.id);
      await linkToProject(context, entity.id, projectId, note.confidence);
      await writeAuditEvent(context, { ...actor, action: "create entity", entityId: entity.id, rawItemId: rawItem.id });
      activityEntries.push(await logAppliedIngestItem(context, actor, rawItem.id, entity.id, "create_memory", "note", note, decision, input.sourceType));
    }
  }

  for (const reminder of normalized.reminders) {
    const decision = await decideIngestItem(context, input, "create_memory", reminder, bulkCount);
    if (decision === "reject_or_ignore") {
      activityEntries.push(await logIgnoredIngestItem(context, actor, rawItem.id, "reminder", reminder, decision, input));
      continue;
    }
    if (decision === "needs_review") {
      reviewItems.push(await createReviewItem(context, rawItem.id, "low_confidence_reminder", "create_reminder", reminder));
      continue;
    }
    const projectId = await resolveProjectId(context, input.projectId, reminder.projectTitle, projectTitleToId);
    const entity = await createGenericEntity(context, {
      entityType: "reminder",
      title: reminder.title,
      status: "scheduled",
      canonical: reminder,
      customFields: reminder.customFields,
      sourceRawItemId: rawItem.id,
      confidenceScore: reminder.confidence
    });
    const [typed] = await context.db
      .insert(reminders)
      .values({
        workspaceId: context.workspaceId,
        entityId: entity.id,
        projectId,
        title: reminder.title,
        remindAt: reminder.remindAt ? new Date(reminder.remindAt) : null,
        recurrenceRule: reminder.recurrenceRule ?? null
      })
      .returning();
    if (typed) {
      createdEntities.push({ entity, reminder: typed });
      entityTitleToId.set(`reminder:${reminder.title.toLowerCase()}`, entity.id);
      await linkToProject(context, entity.id, projectId, reminder.confidence);
      await writeAuditEvent(context, { ...actor, action: "create entity", entityId: entity.id, rawItemId: rawItem.id });
      activityEntries.push(await logAppliedIngestItem(context, actor, rawItem.id, entity.id, "create_memory", "reminder", reminder, decision, input.sourceType));
    }
  }

  await createSimpleEntities(context, input, normalized, rawItem.id, actor, createdEntities, reviewItems, activityEntries, entityTitleToId, bulkCount);
  await createRelationships(context, normalized, entityTitleToId);

  for (const reason of plan.reviewReasons) {
    activityEntries.push(await writeAiActivity(context, {
      ...actor,
      operationType: "inspect_raw_item",
      decision: "reject_or_ignore",
      reason: reason.startsWith("AI normalizer degraded:") ? "normalization_degraded_logged" : "normalization_uncertainty_logged",
      rawItemId: rawItem.id,
      confidence: normalized.confidence,
      sourceReliability: sourceReliabilityForSourceType(input.sourceType),
      input: { reason, normalized }
    }));
  }

  const createdEntityIds = createdEntities
    .map((item) => (item as { entity?: { id: string } }).entity?.id)
    .filter((id): id is string => Boolean(id));
  await enqueuePostIngestJobs(context, createdEntityIds);

  return {
    rawItem,
    normalized,
    createdEntities,
    reviewItems,
    activityEntries,
    applied: createdEntities.length,
    requiresReview: reviewItems.length,
    normalizationDegraded: normalized.uncertainties.some((item) => item.startsWith("AI normalizer degraded:"))
  };
}

function createNormalizer(context: AppContext) {
  if (context.env.OPENAI_AUTH_MODE === "codex") {
    return new OpenAICodexNormalizer({
      tokenProvider: () => resolveOpenAICodexAccessToken(context),
      apiBaseUrl: context.env.OPENAI_CODEX_BASE_URL,
      model: context.env.OPENAI_CODEX_EXTRACTION_MODEL
    });
  }

  return new OpenAINormalizer({
    apiKey: context.env.OPENAI_API_KEY ?? "",
    apiBaseUrl: context.env.OPENAI_API_BASE_URL,
    model: context.env.OPENAI_EXTRACTION_MODEL
  });
}

async function createSimpleEntities(
  context: AppContext,
  input: IngestFreeTextInput,
  normalized: NormalizerOutput,
  rawItemId: string,
  actor: Actor,
  createdEntities: unknown[],
  reviewItems: unknown[],
  activityEntries: unknown[],
  entityTitleToId: Map<string, string>,
  bulkCount: number
) {
  const groups = [
    ["person", normalized.people],
    ["decision", normalized.decisions],
    ["goal", normalized.goals]
  ] as const;

  for (const [type, items] of groups) {
    for (const item of items) {
      const decision = await decideIngestItem(context, input, "create_memory", item, bulkCount);
      if (decision === "reject_or_ignore") {
        activityEntries.push(await logIgnoredIngestItem(context, actor, rawItemId, type, item, decision, input));
        continue;
      }
      if (decision === "needs_review") {
        reviewItems.push(await createReviewItem(context, rawItemId, `low_confidence_${type}`, `create_${type}`, item));
        continue;
      }
      const existing = await findEntityByTitle(context, type, item.title);
      if (existing) continue;
      const entity = await createGenericEntity(context, {
        entityType: type,
        title: item.title,
        body: item.body ?? null,
        canonical: item,
        customFields: item.customFields,
        sourceRawItemId: rawItemId,
        confidenceScore: item.confidence
      });
      createdEntities.push({ entity });
      entityTitleToId.set(`${type}:${item.title.toLowerCase()}`, entity.id);
      await writeAuditEvent(context, { ...actor, action: "create entity", entityId: entity.id, rawItemId });
      activityEntries.push(await logAppliedIngestItem(context, actor, rawItemId, entity.id, "create_memory", type, item, decision, input.sourceType));
    }
  }
}

async function createRelationships(
  context: AppContext,
  normalized: NormalizerOutput,
  entityTitleToId: Map<string, string>
) {
  for (const relationship of normalized.relationships) {
    const fromEntityId = entityTitleToId.get(`${relationship.fromType}:${relationship.fromTitle.toLowerCase()}`);
    const toEntityId = entityTitleToId.get(`${relationship.toType}:${relationship.toTitle.toLowerCase()}`);
    if (!fromEntityId || !toEntityId) continue;
    await context.db.insert(entityEdges).values({
      workspaceId: context.workspaceId,
      fromEntityId,
      toEntityId,
      relationType: relationship.relationType,
      confidenceScore: String(relationship.confidence)
    });
  }
}

async function getProjectName(context: AppContext, projectId: string) {
  const [project] = await context.db
    .select()
    .from(projects)
    .where(and(eq(projects.workspaceId, context.workspaceId), eq(projects.id, projectId)))
    .limit(1);
  return project?.name;
}

async function resolveProjectId(
  context: AppContext,
  explicitProjectId: string | undefined,
  projectTitle: string | undefined,
  projectTitleToId: Map<string, string>
) {
  if (explicitProjectId) return explicitProjectId;
  if (!projectTitle) return null;
  const mapped = projectTitleToId.get(projectTitle.toLowerCase());
  if (mapped) return mapped;
  const existing = await findProjectByName(context, projectTitle);
  return existing?.id ?? null;
}

async function linkToProject(context: AppContext, entityId: string, projectId: string | null, confidence: number) {
  if (!projectId) return;
  const [project] = await context.db
    .select({ entityId: projects.entityId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return;
  await context.db.insert(entityEdges).values({
    workspaceId: context.workspaceId,
    fromEntityId: entityId,
    toEntityId: project.entityId,
    relationType: "belongs_to",
    confidenceScore: String(confidence)
  });
}

async function createReviewItem(
  context: AppContext,
  rawItemId: string,
  reason: string,
  suggestedAction: string,
  suggestedPayload: unknown
) {
  const [reviewItem] = await context.db
    .insert(reviewQueue)
    .values({
      workspaceId: context.workspaceId,
      rawItemId,
      reason,
      suggestedAction,
      suggestedPayload: suggestedPayload as Record<string, unknown>
    })
    .returning();
  return reviewItem;
}

async function decideIngestItem(
  context: AppContext,
  input: IngestFreeTextInput,
  operationType: AiOperationType,
  item: NormalizedEntityItem,
  bulkCount: number
) {
  return decideWorkspaceAiOperation(context, {
    operationType,
    confidence: item.confidence,
    sourceReliability: sourceReliabilityForSourceType(input.sourceType),
    hasSourceQuote: hasSourceEvidence(item),
    userExplicitlyRequested: isExplicitIngest(input),
    destructive: false,
    reversible: true,
    bulkCount,
    conflicts: [],
    ambiguousTargets: [],
    sensitiveFlags: sensitiveFlags(item),
    projectResolved: true,
    possiblyImportant: possiblyImportant(item)
  });
}

async function logIgnoredIngestItem(
  context: AppContext,
  actor: Actor,
  rawItemId: string,
  entityType: string,
  item: NormalizedEntityItem,
  decision: AiOperationDecision,
  input: IngestFreeTextInput
) {
  return writeAiActivity(context, {
    ...actor,
    operationType: entityType === "task" ? "create_task" : "create_memory",
    decision,
    reason: `ignored_low_confidence_${entityType}`,
    rawItemId,
    confidence: item.confidence,
    sourceReliability: sourceReliabilityForSourceType(input.sourceType),
    input: { entityType, item }
  });
}

async function logAppliedIngestItem(
  context: AppContext,
  actor: Actor,
  rawItemId: string,
  entityId: string,
  operationType: AiOperationType,
  entityType: string,
  item: NormalizedEntityItem,
  decision: AiOperationDecision,
  sourceType: string
) {
  return writeAiActivity(context, {
    ...actor,
    operationType,
    decision,
    reason: `auto_applied_${entityType}`,
    rawItemId,
    entityId,
    affectedRecords: [{ type: "entity", id: entityId }],
    newValues: { entityType, item },
    confidence: item.confidence,
    sourceReliability: sourceReliabilityForSourceType(sourceType),
    input: { entityType, item },
    undoStatus: "not_available"
  });
}

function sourceReliabilityForSourceType(sourceType: string) {
  if (sourceType === "manual") return sourceReliabilityDefaults.manual_note;
  if (sourceType === "codex" || sourceType === "api") return sourceReliabilityDefaults.direct_user_command;
  if (sourceType === "web" || sourceType === "openclaw") return sourceReliabilityDefaults.unclear_imported_text;
  return sourceReliabilityDefaults.backfilled_raw_capture;
}

function isExplicitIngest(input: IngestFreeTextInput) {
  return Boolean(input.rawPayload.userExplicitlyRequested) || input.sourceType === "manual" || input.sourceType === "codex" || input.sourceType === "api";
}

function hasSourceEvidence(item: NormalizedEntityItem) {
  return typeof item.customFields.sourceQuote === "string" && item.customFields.sourceQuote.trim().length > 0;
}

function sensitiveFlags(item: NormalizedEntityItem) {
  const flags = item.customFields.sensitiveFlags;
  if (Array.isArray(flags)) return flags.filter((flag): flag is string => typeof flag === "string");
  return [];
}

function possiblyImportant(item: NormalizedEntityItem) {
  return (
    item.importance === "high" ||
    item.importance === "critical" ||
    item.priority === "high" ||
    item.priority === "urgent" ||
    Boolean(item.dueAt) ||
    item.confidence >= 0.5
  );
}

function normalizedItemCount(normalized: NormalizerOutput) {
  return [
    normalized.projects,
    normalized.tasks,
    normalized.notes,
    normalized.reminders,
    normalized.people,
    normalized.decisions,
    normalized.goals
  ].reduce((count, items) => count + items.length, 0);
}
