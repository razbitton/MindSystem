import {
  OpenAICodexMemoryExtractor,
  OpenAICodexMemorySearchPlanner,
  OpenAIEmbeddingClient,
  OpenAIMemoryExtractor,
  vectorToSql
} from "@personal-context-os/ai";
import {
  entities,
  entityAliases,
  entityEdges,
  memoryRecords,
  memorySources,
  projects,
  rawItems,
  retrievalLogs,
  reviewQueue
} from "@personal-context-os/db";
import {
  sourceReliabilityDefaults,
  findSimilarMemory,
  getRelevantContextSchema,
  linkMemorySchema,
  memoryCandidateSchema,
  recallMemorySchema,
  storeMemorySchema,
  supersedeMemorySchema,
  type MemoryCandidate,
  type RecallMemoryInput
} from "@personal-context-os/shared";
import { and, eq, ilike } from "drizzle-orm";
import { createHash } from "node:crypto";
import { decideWorkspaceAiOperation, writeAiActivity } from "./ai-operations.js";
import { createGenericEntity } from "./entities.js";
import { findProjectByName } from "./entity-resolution.js";
import { resolveOpenAICodexAccessToken } from "./openai-codex.js";
import { enqueuePostIngestJobs } from "./queues.js";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

type MemoryRow = Record<string, unknown>;
const MEMORY_VECTOR_RELEVANCE_THRESHOLD = 0.58;
type MemoryRecallMode = "hybrid-vector" | "keyword-fallback" | "codex-keyword";

export async function storeMemory(context: AppContext, input: unknown, actor: Actor) {
  const parsed = storeMemorySchema.parse(input);
  const rawText = parsed.text ?? JSON.stringify({ candidates: parsed.candidates });
  const [rawItem] = await context.db
    .insert(rawItems)
    .values({
      workspaceId: context.workspaceId,
      sourceType: parsed.sourceType,
      authorId: context.userId,
      rawText,
      rawPayload: parsed.rawPayload,
      contentHash: createHash("sha256").update(rawText).digest("hex")
    })
    .returning();

  if (!rawItem) throw new Error("Failed to save raw memory item");

  await writeAuditEvent(context, {
    ...actor,
    action: "store memory raw",
    rawItemId: rawItem.id,
    metadata: { sourceType: parsed.sourceType }
  });

  const projectHint = parsed.projectId ? await getProjectName(context, parsed.projectId) : undefined;
  const extraction = parsed.candidates.length
    ? { candidates: parsed.candidates, degraded: false }
    : await createMemoryExtractor(context).extract({
        text: rawText,
        ...(projectHint ? { projectHint } : {})
      });

  const created: unknown[] = [];
  const updated: unknown[] = [];
  const reviewItems: unknown[] = [];
  const activityEntries: unknown[] = [];
  const entityIds: string[] = [];

  for (const rawCandidate of extraction.candidates) {
    const candidate = memoryCandidateSchema.parse({
      ...rawCandidate,
      projectId: rawCandidate.projectId ?? parsed.projectId ?? undefined
    });

    const conflicts = await findConflictingMemories(context, candidate);
    const sourceReliability = memoryCandidateSourceReliability(candidate, parsed.sourceType);
    const decision = await decideWorkspaceAiOperation(context, {
      operationType: "create_memory",
      confidence: candidate.confidence,
      sourceReliability,
      hasSourceQuote: Boolean(candidate.sourceQuote),
      userExplicitlyRequested: isExplicitMemoryStore(parsed.sourceType, parsed.rawPayload),
      destructive: false,
      reversible: true,
      bulkCount: extraction.candidates.length,
      conflicts,
      ambiguousTargets: [],
      sensitiveFlags: sensitiveFlags(candidate),
      projectResolved: true,
      possiblyImportant: candidate.importance === "high" || candidate.importance === "critical"
    });

    if (decision === "reject_or_ignore") {
      activityEntries.push(await writeAiActivity(context, {
        ...actor,
        operationType: "create_memory",
        decision,
        reason: memoryDecisionReason(decision, candidate, conflicts),
        rawItemId: rawItem.id,
        confidence: candidate.confidence,
        sourceReliability,
        input: { candidate }
      }));
      continue;
    }

    if (decision === "needs_review") {
      reviewItems.push(await createMemoryReviewItem(context, rawItem.id, memoryDecisionReason(decision, candidate, conflicts), candidate));
      continue;
    }

    const existing = await findDuplicateMemory(context, candidate);
    if (existing) {
      const refreshed = await refreshExistingMemory(context, existing, rawItem.id, candidate);
      updated.push(refreshed);
      entityIds.push(existing.entityId);
      activityEntries.push(await writeAiActivity(context, {
        ...actor,
        operationType: "update_memory",
        decision,
        reason: "refreshed_existing_memory_source",
        rawItemId: rawItem.id,
        entityId: existing.entityId,
        affectedRecords: [{ type: "memory_record", id: existing.id }],
        previousValues: { confidenceScore: existing.confidenceScore, lastSeenAt: existing.lastSeenAt },
        newValues: { confidenceScore: refreshed?.confidenceScore, lastSeenAt: refreshed?.lastSeenAt },
        confidence: candidate.confidence,
        sourceReliability,
        input: { candidate }
      }));
      continue;
    }

    const memory = await createMemoryRecordFromCandidate(context, {
      candidate,
      rawItemId: rawItem.id,
      actor,
      ...(parsed.projectId ? { defaultProjectId: parsed.projectId } : {})
    });
    created.push(memory);
    entityIds.push(memory.entity.id);
    activityEntries.push(await writeAiActivity(context, {
      ...actor,
      operationType: "create_memory",
      decision,
      reason: "auto_applied_memory_candidate",
      rawItemId: rawItem.id,
      entityId: memory.entity.id,
      affectedRecords: [{ type: "memory_record", id: memory.memory.id }, { type: "entity", id: memory.entity.id }],
      newValues: { memory: memory.memory, entity: memory.entity },
      confidence: candidate.confidence,
      sourceReliability,
      input: { candidate },
      undoStatus: "not_available"
    }));
  }

  await enqueuePostIngestJobs(context, entityIds);

  if (extraction.degraded) {
    activityEntries.push(await writeAiActivity(context, {
      ...actor,
      operationType: "inspect_raw_item",
      decision: "reject_or_ignore",
      reason: "memory_extraction_degraded_logged",
      rawItemId: rawItem.id,
      confidence: 0.5,
      sourceReliability: sourceReliabilityDefaults.assistant_generated_summary,
      input: { error: extraction.error ?? "Memory extraction degraded.", rawText }
    }));
  }

  return {
    rawItem,
    created,
    updated,
    reviewItems,
    activityEntries,
    degraded: extraction.degraded,
    extractionError: extraction.error ?? null
  };
}

export async function recallMemory(context: AppContext, input: unknown) {
  const parsed = recallMemorySchema.parse(input);
  let embedding: number[] | null = null;
  let degraded = false;
  let error: string | null = null;
  let mode: MemoryRecallMode = "keyword-fallback";
  let searchQuery = parsed.query;
  let searchKeywords: string[] = [];

  if (context.env.OPENAI_AUTH_MODE === "codex") {
    const plan = await createMemorySearchPlanner(context).plan({ query: parsed.query });
    searchQuery = plan.searchQuery;
    searchKeywords = plan.keywords;
    degraded = plan.degraded;
    error = plan.error ?? null;
    mode = plan.degraded ? "keyword-fallback" : "codex-keyword";
  } else {
    try {
      embedding = await createEmbeddingClient(context).embed(parsed.query);
      mode = "hybrid-vector";
    } catch (caught) {
      degraded = true;
      error = caught instanceof Error ? caught.message : "Embedding generation failed.";
      mode = "keyword-fallback";
    }
  }

  const searchTerms = buildRecallSearchTerms(parsed.query, searchQuery, searchKeywords);
  const built = buildMemoryRecallSql(context.workspaceId, parsed, embedding, { searchQuery, searchTerms });
  const result = await context.pool.query(built.sql, built.params);
  const filters: Record<string, unknown> = {
    kinds: parsed.kinds,
    projectId: parsed.projectId,
    entityIds: parsed.entityIds,
    includeSuperseded: parsed.includeSuperseded,
    mode,
    provider: context.env.OPENAI_AUTH_MODE === "codex" ? "codex" : "openai"
  };
  if (embedding) filters.minVectorRank = MEMORY_VECTOR_RELEVANCE_THRESHOLD;
  if (searchQuery !== parsed.query) filters.searchQuery = searchQuery;
  if (searchKeywords.length) filters.searchKeywords = searchKeywords;

  await context.db.insert(retrievalLogs).values({
    workspaceId: context.workspaceId,
    query: parsed.query,
    filters,
    resultCount: result.rowCount ?? 0
  });

  return {
    results: result.rows.map(mapRecallRow),
    retrieval: {
      mode,
      provider: context.env.OPENAI_AUTH_MODE === "codex" ? "codex" : "openai",
      degraded,
      error,
      count: result.rowCount ?? 0,
      ...(embedding ? { minVectorRank: MEMORY_VECTOR_RELEVANCE_THRESHOLD } : {}),
      ...(searchQuery !== parsed.query ? { searchQuery } : {}),
      ...(searchKeywords.length ? { searchKeywords } : {})
    }
  };
}

export async function getRelevantContext(context: AppContext, input: unknown) {
  const parsed = getRelevantContextSchema.parse(input);
  const query = [parsed.message, ...parsed.recentMessages.slice(-5)].join("\n");
  const recalled = await recallMemory(context, {
    query,
    entityIds: parsed.activeEntityIds,
    limit: 20
  });
  const relevantMemories = fitToTokenBudget(recalled.results, parsed.maxTokens);
  const projectIds = uniqueStrings(relevantMemories.map((item) => stringValue(item, "projectId")));
  const openTasks = await loadOpenTasks(context, projectIds);

  return {
    summary: buildContextSummary(parsed.message, relevantMemories),
    likelyEntities: relevantMemories.slice(0, 8).map((item) => ({
      entityId: item.entityId,
      memoryId: item.memoryId,
      title: item.title,
      kind: item.kind,
      projectId: item.projectId ?? null,
      score: item.score
    })),
    relevantMemories,
    openTasks,
    decisions: relevantMemories.filter((item) => item.kind === "decision"),
    preferences: relevantMemories.filter((item) => item.kind === "preference"),
    constraints: relevantMemories.filter((item) => item.kind === "constraint"),
    openQuestions: relevantMemories.filter((item) => item.kind === "open_question"),
    sources: relevantMemories.map((item) => ({
      memoryId: item.memoryId,
      entityId: item.entityId,
      sourceRawItemIds: item.sourceRawItemIds ?? []
    })),
    retrievalTrace: {
      query,
      mode: recalled.retrieval.mode,
      degraded: recalled.retrieval.degraded,
      error: recalled.retrieval.error,
      resultCount: recalled.retrieval.count,
      maxTokens: parsed.maxTokens
    }
  };
}

export async function supersedeMemory(context: AppContext, id: string, input: unknown, actor: Actor) {
  const parsed = supersedeMemorySchema.parse(input);
  const existing = await getMemoryRecord(context, id);
  const extraction = parsed.replacement
    ? { candidates: [parsed.replacement], degraded: false }
    : await createMemoryExtractor(context).extract({ text: parsed.text ?? "" });
  const candidate = memoryCandidateSchema.parse(extraction.candidates[0] ?? {
    kind: existing.kind,
    title: existing.title,
    body: parsed.text ?? existing.body,
    summary: parsed.text?.slice(0, 180) ?? existing.summary ?? undefined,
    importance: existing.importance,
    confidence: 0.76,
    customFields: {}
  });

  const replacement = await createMemoryRecordFromCandidate(context, {
    candidate,
    rawItemId: existing.sourceRawItemId,
    actor,
    ...(existing.projectId ? { defaultProjectId: existing.projectId } : {}),
    supersedesMemoryId: existing.id
  });

  const [updated] = await context.db
    .update(memoryRecords)
    .set({
      status: "superseded",
      validity: "superseded",
      supersededByMemoryId: replacement.memory.id,
      updatedAt: new Date()
    })
    .where(and(eq(memoryRecords.workspaceId, context.workspaceId), eq(memoryRecords.id, id)))
    .returning();

  await writeAuditEvent(context, {
    ...actor,
    action: "supersede memory",
    entityId: existing.entityId,
    metadata: { memoryId: id, replacementMemoryId: replacement.memory.id, reason: parsed.reason ?? null }
  });

  await enqueuePostIngestJobs(context, [replacement.entity.id]);
  return { previous: updated, replacement, degraded: extraction.degraded };
}

export async function linkMemory(context: AppContext, input: unknown, actor: Actor) {
  const parsed = linkMemorySchema.parse(input);
  const fromEntityId = parsed.fromEntityId ?? (parsed.fromMemoryId ? (await getMemoryRecord(context, parsed.fromMemoryId)).entityId : null);
  const toEntityId = parsed.toEntityId ?? (parsed.toMemoryId ? (await getMemoryRecord(context, parsed.toMemoryId)).entityId : null);
  if (!fromEntityId || !toEntityId) throw new Error("Could not resolve memory link endpoints.");

  const [edge] = await context.db
    .insert(entityEdges)
    .values({
      workspaceId: context.workspaceId,
      fromEntityId,
      toEntityId,
      relationType: parsed.relationType,
      confidenceScore: String(parsed.confidence)
    })
    .returning();

  await writeAuditEvent(context, {
    ...actor,
    action: "link memory",
    entityId: fromEntityId,
    metadata: { toEntityId, relationType: parsed.relationType }
  });

  return { edge };
}

export async function getMemoryDetails(context: AppContext, id: string) {
  const memory = await getMemoryRecord(context, id);
  const sources = await context.db
    .select()
    .from(memorySources)
    .where(and(eq(memorySources.workspaceId, context.workspaceId), eq(memorySources.memoryRecordId, id)));
  const [entity] = await context.db
    .select()
    .from(entities)
    .where(and(eq(entities.workspaceId, context.workspaceId), eq(entities.id, memory.entityId)))
    .limit(1);

  return { memory, entity: entity ?? null, sources };
}

export async function createMemoryRecordFromCandidate(
  context: AppContext,
  input: {
    candidate: MemoryCandidate;
    rawItemId: string | null;
    actor: Actor;
    defaultProjectId?: string;
    supersedesMemoryId?: string;
  }
) {
  const projectId = await resolveMemoryProjectId(context, input.candidate, input.defaultProjectId);
  const entity = await createGenericEntity(context, {
    entityType: "memory",
    title: input.candidate.title,
    summary: input.candidate.summary ?? input.candidate.body.slice(0, 180),
    body: input.candidate.body,
    status: "active",
    canonical: input.candidate,
    customFields: {
      memoryKind: input.candidate.kind,
      importance: input.candidate.importance
    },
    sourceRawItemId: input.rawItemId,
    confidenceScore: input.candidate.confidence
  });

  const [memory] = await context.db
    .insert(memoryRecords)
    .values({
      workspaceId: context.workspaceId,
      entityId: entity.id,
      projectId,
      sourceRawItemId: input.rawItemId,
      kind: input.candidate.kind,
      status: "active",
      importance: input.candidate.importance,
      title: input.candidate.title,
      summary: input.candidate.summary ?? null,
      body: input.candidate.body,
      confidenceScore: String(input.candidate.confidence),
      supersedesMemoryId: input.supersedesMemoryId ?? null,
      occurredAt: input.candidate.occurredAt ? new Date(input.candidate.occurredAt) : null,
      lastVerifiedAt: new Date(),
      validity: "current",
      confidenceReason: stringField(input.candidate.customFields, "confidenceReason"),
      sourceReliability: String(numberField(input.candidate.customFields, "sourceReliability") ?? 0.8),
      customFields: input.candidate.customFields
    })
    .returning();
  if (!memory) throw new Error("Failed to create memory record.");

  await createMemorySource(context, memory.id, input.rawItemId, input.candidate);
  await createAliases(context, entity.id, input.candidate.aliases);
  await createMemoryLinks(context, entity.id, input.candidate.relatedEntities);
  if (projectId) await linkMemoryToProject(context, entity.id, projectId, input.candidate.confidence);

  await writeAuditEvent(context, {
    ...input.actor,
    action: "create memory",
    entityId: entity.id,
    rawItemId: input.rawItemId,
    metadata: { memoryId: memory.id, kind: memory.kind }
  });

  return { memory, entity };
}

export function buildMemoryRecallSql(
  workspaceId: string,
  query: RecallMemoryInput,
  embedding: number[] | null,
  options: { searchQuery?: string; searchTerms?: string[] } = {}
) {
  const params: unknown[] = [workspaceId];
  const where = ["mr.workspace_id = $1"];

  if (!query.includeSuperseded) {
    where.push("mr.status = 'active'");
  }
  if (query.kinds.length) {
    params.push(query.kinds);
    where.push(`mr.kind = any($${params.length}::memory_kind[])`);
  }
  if (query.projectId) {
    params.push(query.projectId);
    where.push(`mr.project_id = $${params.length}`);
  }
  if (query.entityIds.length) {
    params.push(query.entityIds);
    where.push(`(
      mr.entity_id = any($${params.length}::uuid[])
      or exists (
        select 1 from entity_edges ee
        where ee.workspace_id = mr.workspace_id
          and ee.from_entity_id = mr.entity_id
          and ee.to_entity_id = any($${params.length}::uuid[])
      )
      or exists (
        select 1 from entity_edges ee
        where ee.workspace_id = mr.workspace_id
          and ee.to_entity_id = mr.entity_id
          and ee.from_entity_id = any($${params.length}::uuid[])
      )
    )`);
  }

  params.push(options.searchQuery?.trim() || query.query);
  const qIndex = params.length;
  const searchTerms = options.searchTerms?.length ? options.searchTerms : [query.query];
  params.push(searchTerms);
  const termIndex = params.length;

  let vectorIndex: number | null = null;
  if (embedding) {
    params.push(vectorToSql(embedding));
    vectorIndex = params.length;
  } else {
    where.push(`(
      c.fts @@ plainto_tsquery('english', $${qIndex})
      or exists (
        select 1 from unnest($${termIndex}::text[]) as search_term(term)
        where e.title ilike '%' || search_term.term || '%'
          or mr.title ilike '%' || search_term.term || '%'
          or mr.body ilike '%' || search_term.term || '%'
          or coalesce(mr.summary, '') ilike '%' || search_term.term || '%'
      )
    )`);
  }

  params.push(query.limit);
  const limitIndex = params.length;
  const vectorRank = vectorIndex
    ? `coalesce(1 / (1 + min(c.embedding <=> $${vectorIndex}::vector)), 0)`
    : "0";
  const keywordRank = `greatest(
    coalesce(max(ts_rank(c.fts, plainto_tsquery('english', $${qIndex}))), 0),
    case when exists (
      select 1 from unnest($${termIndex}::text[]) as search_term(term)
      where e.title ilike '%' || search_term.term || '%'
        or mr.title ilike '%' || search_term.term || '%'
        or mr.body ilike '%' || search_term.term || '%'
        or coalesce(mr.summary, '') ilike '%' || search_term.term || '%'
    ) then 0.2 else 0 end
  )`;
  const relevanceGate = vectorIndex
    ? `where keyword_rank > 0 or vector_rank >= ${MEMORY_VECTOR_RELEVANCE_THRESHOLD}`
    : "";

  return {
    params,
    sql: `
      with ranked as (
        select mr.id as memory_id, mr.id as "memoryId",
               mr.entity_id as entity_id, mr.entity_id as "entityId",
               mr.kind::text as kind, mr.status::text as status, mr.importance::text as importance,
               mr.title, mr.summary, mr.body, mr.confidence_score, mr.confidence_score as "confidenceScore",
               mr.project_id as project_id, mr.project_id as "projectId",
               p.name as project_name, p.name as "projectName",
               mr.created_at, mr.created_at as "createdAt",
               mr.updated_at, mr.updated_at as "updatedAt",
               mr.occurred_at, mr.occurred_at as "occurredAt",
               mr.last_seen_at, mr.last_seen_at as "lastSeenAt",
               mr.last_verified_at, mr.last_verified_at as "lastVerifiedAt",
               mr.expires_at, mr.expires_at as "expiresAt",
               mr.stale_after, mr.stale_after as "staleAfter",
               mr.validity::text as validity,
               mr.confidence_reason, mr.confidence_reason as "confidenceReason",
               mr.source_reliability, mr.source_reliability as "sourceReliability",
               mr.custom_fields, mr.custom_fields as "customFields",
               coalesce(array_remove(array_agg(distinct ms.raw_item_id), null), array[]::uuid[]) as source_raw_item_ids,
               coalesce(array_remove(array_agg(distinct ms.raw_item_id), null), array[]::uuid[]) as "sourceRawItemIds",
               coalesce(array_remove(array_agg(distinct ms.source_quote), null), array[]::text[]) as source_quotes,
               coalesce(array_remove(array_agg(distinct ms.source_quote), null), array[]::text[]) as "sourceQuotes",
               coalesce(array_remove(array_agg(distinct ee.to_entity_id), null), array[]::uuid[]) as related_entity_ids,
               coalesce(array_remove(array_agg(distinct ee.to_entity_id), null), array[]::uuid[]) as "relatedEntityIds",
               ${keywordRank} as keyword_rank,
               ${keywordRank} as "keywordRank",
               ${vectorRank} as vector_rank,
               ${vectorRank} as "vectorRank",
               case mr.importance
                 when 'critical' then 1
                 when 'high' then 0.75
                 when 'medium' then 0.5
                 else 0.25
               end as importance_rank,
               greatest(0, 1 - extract(epoch from (now() - mr.updated_at)) / 2592000) as recency_rank
        from memory_records mr
        join entities e on e.id = mr.entity_id
        left join chunks c on c.entity_id = mr.entity_id
        left join memory_sources ms on ms.memory_record_id = mr.id
        left join entity_edges ee on ee.from_entity_id = mr.entity_id and ee.workspace_id = mr.workspace_id
        left join projects p on p.id = mr.project_id
        where ${where.join(" and ")}
        group by mr.id, p.id
      )
      select *,
             (keyword_rank * 0.3 + vector_rank * 0.55 + importance_rank * 0.1 + recency_rank * 0.05) as score
      from ranked
      ${relevanceGate}
      order by score desc, "updatedAt" desc
      limit $${limitIndex}
    `
  };
}

async function refreshExistingMemory(context: AppContext, existing: typeof memoryRecords.$inferSelect, rawItemId: string, candidate: MemoryCandidate) {
  const [updated] = await context.db
    .update(memoryRecords)
    .set({
      lastSeenAt: new Date(),
      confidenceScore: String(Math.max(Number(existing.confidenceScore), candidate.confidence)),
      lastVerifiedAt: new Date(),
      validity: "current",
      updatedAt: new Date()
    })
    .where(eq(memoryRecords.id, existing.id))
    .returning();
  await createMemorySource(context, existing.id, rawItemId, candidate);
  return updated;
}

async function findDuplicateMemory(context: AppContext, candidate: MemoryCandidate) {
  const [existing] = await context.db
    .select()
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.workspaceId, context.workspaceId),
        eq(memoryRecords.kind, candidate.kind),
        eq(memoryRecords.status, "active"),
        ilike(memoryRecords.title, candidate.title.trim())
      )
    )
    .limit(1);
  if (existing) return existing;

  const nearby = await context.db
    .select()
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.workspaceId, context.workspaceId),
        eq(memoryRecords.kind, candidate.kind),
        eq(memoryRecords.status, "active"),
        eq(memoryRecords.validity, "current")
      )
    )
    .limit(50);

  return findSimilarMemory(nearby, candidate);
}

async function findConflictingMemories(context: AppContext, candidate: MemoryCandidate) {
  if (!["decision", "constraint", "commitment"].includes(candidate.kind)) return [];

  const existing = await context.db
    .select({
      id: memoryRecords.id,
      title: memoryRecords.title,
      body: memoryRecords.body,
      confidenceScore: memoryRecords.confidenceScore
    })
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.workspaceId, context.workspaceId),
        eq(memoryRecords.kind, candidate.kind),
        eq(memoryRecords.status, "active"),
        eq(memoryRecords.validity, "current"),
        ilike(memoryRecords.title, candidate.title.trim())
      )
    )
    .limit(5);

  return existing.filter((memory) => memory.body.trim() !== candidate.body.trim());
}

async function getMemoryRecord(context: AppContext, id: string) {
  const [memory] = await context.db
    .select()
    .from(memoryRecords)
    .where(and(eq(memoryRecords.workspaceId, context.workspaceId), eq(memoryRecords.id, id)))
    .limit(1);
  if (!memory) throw new Error("Memory record not found");
  return memory;
}

async function resolveMemoryProjectId(context: AppContext, candidate: MemoryCandidate, defaultProjectId?: string) {
  if (candidate.projectId) return candidate.projectId;
  if (defaultProjectId) return defaultProjectId;
  if (!candidate.projectTitle) return null;
  const existing = await findProjectByName(context, candidate.projectTitle);
  return existing?.id ?? null;
}

async function getProjectName(context: AppContext, projectId: string) {
  const [project] = await context.db
    .select({ name: projects.name })
    .from(projects)
    .where(and(eq(projects.workspaceId, context.workspaceId), eq(projects.id, projectId)))
    .limit(1);
  return project?.name;
}

async function createMemorySource(context: AppContext, memoryRecordId: string, rawItemId: string | null, candidate: MemoryCandidate) {
  const [source] = await context.db
    .insert(memorySources)
    .values({
      workspaceId: context.workspaceId,
      memoryRecordId,
      rawItemId,
      sourceQuote: candidate.sourceQuote ?? null,
      metadata: { confidence: candidate.confidence }
    })
    .returning();
  return source;
}

async function createAliases(context: AppContext, entityId: string, aliases: string[]) {
  for (const alias of aliases) {
    await context.db
      .insert(entityAliases)
      .values({ workspaceId: context.workspaceId, entityId, alias })
      .onConflictDoNothing();
  }
}

async function createMemoryLinks(
  context: AppContext,
  fromEntityId: string,
  references: MemoryCandidate["relatedEntities"]
) {
  for (const reference of references) {
    const toEntityId = reference.entityId ?? (reference.title ? (await findEntityByTitleOrAlias(context, reference.title))?.id : null);
    if (!toEntityId) continue;
    await context.db.insert(entityEdges).values({
      workspaceId: context.workspaceId,
      fromEntityId,
      toEntityId,
      relationType: reference.relationType,
      confidenceScore: "1"
    });
  }
}

async function linkMemoryToProject(context: AppContext, memoryEntityId: string, projectId: string, confidence: number) {
  const [project] = await context.db.select({ entityId: projects.entityId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return;
  await context.db.insert(entityEdges).values({
    workspaceId: context.workspaceId,
    fromEntityId: memoryEntityId,
    toEntityId: project.entityId,
    relationType: "belongs_to",
    confidenceScore: String(confidence)
  });
}

async function findEntityByTitleOrAlias(context: AppContext, title: string) {
  const [entity] = await context.db
    .select()
    .from(entities)
    .where(and(eq(entities.workspaceId, context.workspaceId), ilike(entities.title, title.trim())))
    .limit(1);
  if (entity) return entity;

  const [alias] = await context.db
    .select({ entity: entities })
    .from(entityAliases)
    .innerJoin(entities, eq(entities.id, entityAliases.entityId))
    .where(and(eq(entityAliases.workspaceId, context.workspaceId), ilike(entityAliases.alias, title.trim())))
    .limit(1);
  return alias?.entity ?? null;
}

async function createMemoryReviewItem(context: AppContext, rawItemId: string, reason: string, suggestedPayload: unknown) {
  const [reviewItem] = await context.db
    .insert(reviewQueue)
    .values({
      workspaceId: context.workspaceId,
      rawItemId,
      reason,
      suggestedAction: "create_memory_record",
      suggestedPayload: suggestedPayload as Record<string, unknown>
    })
    .returning();
  return reviewItem;
}

function createMemoryExtractor(context: AppContext) {
  if (context.env.OPENAI_AUTH_MODE === "codex") {
    return new OpenAICodexMemoryExtractor({
      tokenProvider: () => resolveOpenAICodexAccessToken(context),
      apiBaseUrl: context.env.OPENAI_CODEX_BASE_URL,
      model: context.env.OPENAI_CODEX_EXTRACTION_MODEL
    });
  }

  return new OpenAIMemoryExtractor({
    apiKey: context.env.OPENAI_API_KEY ?? "",
    apiBaseUrl: context.env.OPENAI_API_BASE_URL,
    model: context.env.OPENAI_EXTRACTION_MODEL
  });
}

function createMemorySearchPlanner(context: AppContext) {
  return new OpenAICodexMemorySearchPlanner({
    tokenProvider: () => resolveOpenAICodexAccessToken(context),
    apiBaseUrl: context.env.OPENAI_CODEX_BASE_URL,
    model: context.env.OPENAI_CODEX_RETRIEVAL_MODEL
  });
}

function createEmbeddingClient(context: AppContext) {
  return new OpenAIEmbeddingClient({
    apiKey: context.env.OPENAI_API_KEY ?? "",
    apiBaseUrl: context.env.OPENAI_API_BASE_URL,
    model: context.env.OPENAI_EMBEDDING_MODEL
  });
}

function buildRecallSearchTerms(originalQuery: string, searchQuery: string, keywords: string[]) {
  const candidates = [originalQuery, searchQuery, ...keywords];
  const terms: string[] = [];
  for (const candidate of candidates) {
    const trimmed = candidate.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    terms.push(trimmed);
    for (const part of trimmed.split(/[,\n;|]+/)) {
      const value = part.trim();
      if (value.length >= 2) terms.push(value);
    }
    for (const part of trimmed.split(/\s+/)) {
      const value = part.trim();
      if (value.length >= 2) terms.push(value);
    }
  }
  return Array.from(new Set(terms)).slice(0, 24);
}

function mapRecallRow(row: MemoryRow) {
  const keywordRank = numberValue(row.keywordRank ?? row.keyword_rank);
  const vectorRank = numberValue(row.vectorRank ?? row.vector_rank);
  return {
    ...row,
    score: numberValue(row.score),
    keywordRank,
    vectorRank,
    reason: vectorRank >= MEMORY_VECTOR_RELEVANCE_THRESHOLD && vectorRank > keywordRank ? "semantic match" : "text or metadata match"
  };
}

function fitToTokenBudget(rows: MemoryRow[], maxTokens: number) {
  const maxChars = maxTokens * 4;
  const kept: MemoryRow[] = [];
  let used = 0;
  for (const row of rows) {
    const size = JSON.stringify(row).length;
    if (kept.length > 0 && used + size > maxChars) break;
    kept.push(row);
    used += size;
  }
  return kept;
}

async function loadOpenTasks(context: AppContext, projectIds: string[]) {
  const params: unknown[] = [context.workspaceId];
  const projectFilter = projectIds.length ? "and project_id = any($2::uuid[])" : "";
  if (projectIds.length) params.push(projectIds);
  const result = await context.pool.query(
    `select * from tasks
     where workspace_id = $1
       and status not in ('done', 'cancelled')
       ${projectFilter}
     order by priority desc, due_at nulls last, updated_at desc
     limit 10`,
    params
  );
  return result.rows;
}

function buildContextSummary(message: string, memories: MemoryRow[]) {
  if (memories.length === 0) return `No stored memory matched the current message: ${message}`;
  const titles = memories.slice(0, 5).map((item) => item.title).filter(Boolean).join("; ");
  return `Relevant stored context for "${message.slice(0, 120)}": ${titles}`;
}

function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function stringValue(record: MemoryRow, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function memoryCandidateSourceReliability(candidate: MemoryCandidate, sourceType: string) {
  const explicit = numberField(candidate.customFields, "sourceReliability");
  if (explicit !== null) return explicit;
  if (sourceType === "manual") return sourceReliabilityDefaults.manual_note;
  if (sourceType === "codex" || sourceType === "api") return sourceReliabilityDefaults.direct_user_command;
  if (sourceType === "web" || sourceType === "openclaw") return sourceReliabilityDefaults.unclear_imported_text;
  return sourceReliabilityDefaults.backfilled_raw_capture;
}

function sensitiveFlags(candidate: MemoryCandidate) {
  const flags = candidate.customFields.sensitiveFlags;
  if (Array.isArray(flags)) return flags.filter((flag): flag is string => typeof flag === "string");
  return [];
}

function isExplicitMemoryStore(sourceType: string, rawPayload: Record<string, unknown>) {
  return Boolean(rawPayload.userExplicitlyRequested) || sourceType === "codex" || sourceType === "manual" || sourceType === "api";
}

function memoryDecisionReason(decision: string, candidate: MemoryCandidate, conflicts: unknown[]) {
  if (conflicts.length > 0) return "memory_conflict";
  if (sensitiveFlags(candidate).length > 0) return "sensitive_memory_candidate";
  if (decision === "reject_or_ignore") {
    return candidate.kind === "topic_note" ? "ignored_low_value_topic_note" : "ignored_low_confidence_memory";
  }
  if (!candidate.sourceQuote) return "missing_source_quote";
  return "medium_confidence_memory";
}
