import { z } from "zod";

export const sourceTypeSchema = z.enum(["web", "whatsapp", "openclaw", "codex", "api", "manual"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const entityTypeSchema = z.enum([
  "project",
  "task",
  "note",
  "document",
  "memory",
  "decision",
  "reminder",
  "person",
  "goal"
]);
export type EntityType = z.infer<typeof entityTypeSchema>;

export const projectStatusSchema = z.enum(["active", "paused", "completed", "archived"]);
export const taskStatusSchema = z.enum(["inbox", "todo", "in_progress", "waiting", "done", "cancelled"]);
export const taskKindSchema = z.enum(["one_off", "ongoing"]);
export const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const dailyObjectiveStateSchema = z.enum(["pinned", "dismissed"]);
export const dailyObjectiveActionSchema = z.enum(["pin", "snooze", "clear"]);
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date.");
export const projectColorSchema = z.string().trim().regex(/^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/).nullable().optional();
export const relationTypeSchema = z.enum([
  "belongs_to",
  "depends_on",
  "mentions",
  "blocks",
  "derived_from",
  "related_to"
]);

export const memoryKindSchema = z.enum([
  "fact",
  "decision",
  "preference",
  "constraint",
  "commitment",
  "open_question",
  "project_update",
  "person_profile",
  "topic_note"
]);
export type MemoryKind = z.infer<typeof memoryKindSchema>;

export const memoryStatusSchema = z.enum(["active", "superseded", "archived"]);
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;

export const memoryImportanceSchema = z.enum(["low", "medium", "high", "critical"]);
export type MemoryImportance = z.infer<typeof memoryImportanceSchema>;

export const memoryValiditySchema = z.enum(["current", "stale", "disputed", "superseded"]);
export type MemoryValidity = z.infer<typeof memoryValiditySchema>;

export const memoryEntityReferenceSchema = z.object({
  entityId: z.string().uuid().optional(),
  entityType: entityTypeSchema.optional(),
  title: z.string().trim().min(1).optional(),
  relationType: relationTypeSchema.default("related_to")
}).refine((value) => Boolean(value.entityId || value.title), {
  message: "Either entityId or title is required for a memory entity reference."
});

export const memoryCandidateSchema = z.object({
  kind: memoryKindSchema,
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  summary: z.string().trim().optional(),
  importance: memoryImportanceSchema.default("medium"),
  confidence: z.number().min(0).max(1).default(0.8),
  projectId: z.string().uuid().nullable().optional(),
  projectTitle: z.string().trim().min(1).optional(),
  relatedEntities: z.array(memoryEntityReferenceSchema).default([]),
  aliases: z.array(z.string().trim().min(1)).default([]),
  sourceQuote: z.string().trim().optional(),
  occurredAt: z.string().datetime().nullable().optional(),
  customFields: z.record(z.unknown()).default({})
});
export type MemoryCandidate = z.infer<typeof memoryCandidateSchema>;

export const recallMemorySchema = z.object({
  query: z.string().trim().min(1),
  kinds: z.array(memoryKindSchema).default([]),
  projectId: z.string().uuid().optional(),
  entityIds: z.array(z.string().uuid()).default([]),
  includeSuperseded: z.boolean().default(false),
  limit: z.coerce.number().int().positive().max(50).default(10)
});
export type RecallMemoryInput = z.infer<typeof recallMemorySchema>;

export const getRelevantContextSchema = z.object({
  message: z.string().trim().min(1),
  recentMessages: z.array(z.string().trim().min(1)).default([]),
  conversationId: z.string().trim().min(1).optional(),
  activeEntityIds: z.array(z.string().uuid()).default([]),
  maxTokens: z.coerce.number().int().positive().max(12000).default(2500)
});
export type GetRelevantContextInput = z.infer<typeof getRelevantContextSchema>;

export const prepareTurnContextSchema = z.object({
  message: z.string().trim().min(1),
  conversationId: z.string().trim().min(1).optional(),
  recentMessages: z.array(z.string().trim().min(1)).default([]),
  activeProjectId: z.string().uuid().optional(),
  activeEntityIds: z.array(z.string().uuid()).default([]),
  client: z.enum(["codex", "claude", "chatgpt", "api", "web", "mcp", "other"]).default("api"),
  maxTokens: z.coerce.number().int().positive().max(12000).default(4000)
});
export type PrepareTurnContextInput = z.infer<typeof prepareTurnContextSchema>;

export const storeMemorySchema = z.object({
  text: z.string().trim().optional(),
  candidates: z.array(memoryCandidateSchema).default([]),
  sourceType: sourceTypeSchema.default("codex"),
  projectId: z.string().uuid().optional(),
  rawPayload: z.record(z.unknown()).default({})
}).refine((value) => Boolean(value.text || value.candidates.length > 0), {
  message: "Either text or candidates must be provided."
});
export type StoreMemoryInput = z.infer<typeof storeMemorySchema>;

export const supersedeMemorySchema = z.object({
  replacement: memoryCandidateSchema.optional(),
  text: z.string().trim().optional(),
  reason: z.string().trim().optional()
}).refine((value) => Boolean(value.replacement || value.text), {
  message: "Either replacement or text must be provided."
});
export type SupersedeMemoryInput = z.infer<typeof supersedeMemorySchema>;

export const linkMemorySchema = z.object({
  fromMemoryId: z.string().uuid().optional(),
  fromEntityId: z.string().uuid().optional(),
  toMemoryId: z.string().uuid().optional(),
  toEntityId: z.string().uuid().optional(),
  relationType: relationTypeSchema.default("related_to"),
  confidence: z.number().min(0).max(1).default(1)
}).refine((value) => Boolean(value.fromMemoryId || value.fromEntityId), {
  message: "A fromMemoryId or fromEntityId is required."
}).refine((value) => Boolean(value.toMemoryId || value.toEntityId), {
  message: "A toMemoryId or toEntityId is required."
});
export type LinkMemoryInput = z.infer<typeof linkMemorySchema>;

const metadataTagPrefixPattern = /^\s*\[[^\]\r\n]{1,40}\]\s*/;
const taskTitleSchema = z
  .string()
  .trim()
  .min(1)
  .refine((title) => !metadataTagPrefixPattern.test(title), {
    message: "Task title must not start with bracketed metadata; use assignee, status, project, or notes fields instead."
  });

export const normalizedRelationshipSchema = z.object({
  fromTitle: z.string().min(1),
  fromType: entityTypeSchema,
  toTitle: z.string().min(1),
  toType: entityTypeSchema,
  relationType: relationTypeSchema,
  confidence: z.number().min(0).max(1).default(0.8)
});

export const normalizedProjectSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  goal: z.string().optional(),
  color: projectColorSchema.nullable().optional(),
  status: projectStatusSchema.default("active"),
  priority: prioritySchema.default("medium"),
  dueAt: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1).default(0.85),
  customFields: z.record(z.unknown()).default({})
});

export const normalizedTaskSchema = z.object({
  title: taskTitleSchema,
  description: z.string().optional(),
  projectTitle: z.string().optional(),
  kind: taskKindSchema.default("one_off"),
  status: taskStatusSchema.default("todo"),
  priority: prioritySchema.default("medium"),
  dueAt: z.string().datetime().optional(),
  scheduledFor: z.string().datetime().optional(),
  estimateMinutes: z.number().int().positive().optional(),
  assignee: z.string().optional(),
  dependsOnTitle: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.85),
  customFields: z.record(z.unknown()).default({})
});

export const normalizedNoteSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  projectTitle: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.85),
  customFields: z.record(z.unknown()).default({})
});

export const normalizedReminderSchema = z.object({
  title: z.string().min(1),
  remindAt: z.string().datetime().optional(),
  recurrenceRule: z.string().optional(),
  projectTitle: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.85),
  customFields: z.record(z.unknown()).default({})
});

export const normalizedSimpleEntitySchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  projectTitle: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.75),
  customFields: z.record(z.unknown()).default({})
});

export const normalizerOutputSchema = z.object({
  intent: z.enum([
    "create_project",
    "add_tasks",
    "capture_note",
    "create_reminder",
    "mixed",
    "unknown"
  ]),
  confidence: z.number().min(0).max(1).default(0.8),
  projects: z.array(normalizedProjectSchema).default([]),
  tasks: z.array(normalizedTaskSchema).default([]),
  notes: z.array(normalizedNoteSchema).default([]),
  reminders: z.array(normalizedReminderSchema).default([]),
  people: z.array(normalizedSimpleEntitySchema).default([]),
  decisions: z.array(normalizedSimpleEntitySchema).default([]),
  goals: z.array(normalizedSimpleEntitySchema).default([]),
  relationships: z.array(normalizedRelationshipSchema).default([]),
  uncertainties: z.array(z.string()).default([])
});
export type NormalizerOutput = z.infer<typeof normalizerOutputSchema>;

export const ingestFreeTextSchema = z.object({
  text: z.string().min(1),
  sourceType: sourceTypeSchema.default("manual"),
  projectId: z.string().uuid().optional(),
  rawPayload: z.record(z.unknown()).default({})
});
export type IngestFreeTextInput = z.infer<typeof ingestFreeTextSchema>;

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  goal: z.string().optional(),
  color: projectColorSchema.nullable().optional(),
  status: projectStatusSchema.default("active"),
  priority: prioritySchema.default("medium"),
  dueAt: z.string().datetime().nullable().optional()
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const patchProjectSchema = createProjectSchema.partial();

export const createTaskSchema = z.object({
  title: taskTitleSchema,
  description: z.string().optional(),
  projectId: z.string().uuid().nullable().optional(),
  kind: taskKindSchema.default("one_off"),
  status: taskStatusSchema.default("todo"),
  priority: prioritySchema.default("medium"),
  dueAt: z.string().datetime().nullable().optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
  estimateMinutes: z.number().int().positive().nullable().optional(),
  assignee: z.string().nullable().optional(),
  dependsOnTaskId: z.string().uuid().nullable().optional()
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const patchTaskSchema = createTaskSchema.partial().extend({
  completedAt: z.string().datetime().nullable().optional()
});

export const manageTaskActionSchema = z.enum([
  "create",
  "update",
  "complete",
  "cancel",
  "pin",
  "snooze",
  "clear_daily_objective"
]);

export const manageTaskSchema = patchTaskSchema.extend({
  action: manageTaskActionSchema,
  id: z.string().uuid().optional(),
  date: localDateSchema.optional(),
  targetDate: localDateSchema.optional()
}).superRefine((value, context) => {
  if (value.action === "create" && !value.title) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "title is required when creating a task.",
      path: ["title"]
    });
  }
  if (value.action !== "create" && !value.id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "id is required for this task action.",
      path: ["id"]
    });
  }
  if (["pin", "snooze", "clear_daily_objective"].includes(value.action) && !value.date) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "date is required for daily objective task actions.",
      path: ["date"]
    });
  }
  if (value.action === "snooze" && !value.targetDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "targetDate is required when snoozing a task.",
      path: ["targetDate"]
    });
  }
});
export type ManageTaskInput = z.infer<typeof manageTaskSchema>;

export const dashboardTodayQuerySchema = z.object({
  date: localDateSchema.optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional()
});

export const googleCalendarSendUpdatesSchema = z.enum(["all", "externalOnly", "none"]);

export const googleCalendarAttendeeSchema = z.object({
  email: z.string().email()
});

const googleCalendarDateTimeSchema = z.string().datetime({ offset: true });
export const googleCalendarEventTimeSchema = z.string().min(1);

const googleCalendarCreateEventBaseSchema = z.object({
  calendarId: z.string().min(1),
  summary: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  start: googleCalendarEventTimeSchema,
  end: googleCalendarEventTimeSchema,
  allDay: z.boolean().default(false),
  timeZone: z.string().min(1).optional(),
  attendees: z.array(googleCalendarAttendeeSchema).default([]),
  sendUpdates: googleCalendarSendUpdatesSchema.default("all")
});

export const googleCalendarCreateEventSchema = googleCalendarCreateEventBaseSchema.superRefine(validateGoogleCalendarEventTime);

export type GoogleCalendarCreateEventInput = z.infer<typeof googleCalendarCreateEventSchema>;

export const googleCalendarPatchEventSchema = googleCalendarCreateEventBaseSchema.partial().extend({
  calendarId: z.string().min(1)
}).superRefine((value, context) => {
  if ((value.start !== undefined || value.end !== undefined) && (!value.start || !value.end)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "start and end must be provided together when changing event time.",
      path: value.start ? ["end"] : ["start"]
    });
    return;
  }
  if (value.start && value.end) validateGoogleCalendarEventTime(value as z.infer<typeof googleCalendarCreateEventSchema>, context);
});

export type GoogleCalendarPatchEventInput = z.infer<typeof googleCalendarPatchEventSchema>;

export const googleCalendarEventsQuerySchema = z.object({
  timeMin: googleCalendarDateTimeSchema,
  timeMax: googleCalendarDateTimeSchema,
  timeZone: z.string().min(1).optional(),
  calendarIds: z.union([z.string().min(1), z.array(z.string().min(1))]).optional()
}).refine((value) => new Date(value.timeMin) < new Date(value.timeMax), {
  message: "timeMin must be earlier than timeMax.",
  path: ["timeMax"]
});

export const googleCalendarPreferencesSchema = z.object({
  selectedCalendarIds: z.array(z.string().min(1)).default([])
});

export const setDailyObjectiveSchema = z.object({
  date: localDateSchema,
  action: dailyObjectiveActionSchema,
  targetDate: localDateSchema.optional()
}).refine((value) => value.action !== "snooze" || Boolean(value.targetDate), {
  message: "targetDate is required when snoozing a daily objective.",
  path: ["targetDate"]
});

export const createNoteSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  projectId: z.string().uuid().nullable().optional()
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const patchNoteSchema = createNoteSchema.partial();

export const createDocumentSchema = z.object({
  title: z.string().min(1),
  projectId: z.string().uuid().nullable().optional(),
  objectKey: z.string().optional(),
  mimeType: z.string().optional(),
  extractedText: z.string().optional()
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const uploadDocumentSchema = createDocumentSchema.pick({
  title: true,
  projectId: true,
  extractedText: true
}).extend({
  file: z.object({
    name: z.string().trim().min(1),
    mimeType: z.string().trim().optional(),
    dataBase64: z.string().min(1)
  })
});
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

export const patchDocumentSchema = createDocumentSchema.partial();

export const createReminderSchema = z.object({
  title: z.string().min(1),
  projectId: z.string().uuid().nullable().optional(),
  remindAt: z.string().datetime().nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
  status: z.string().min(1).default("scheduled")
});
export type CreateReminderInput = z.infer<typeof createReminderSchema>;

export const patchReminderSchema = createReminderSchema.partial();

export const deleteRawItemSchema = z.object({
  deleteDerivedEntities: z.boolean().default(false)
});

export const clearRawItemsSchema = deleteRawItemSchema;

export const purgeDataTypeSchema = z.enum([
  "raw_items",
  "entities",
  "memory_records",
  "memory_sources",
  "entity_aliases",
  "review_queue",
  "audit_events",
  "ai_activity_log",
  "ai_operation_policies",
  "agent_runs",
  "ai_processing_runs",
  "ai_processing_schedules",
  "retrieval_logs",
  "schema_definitions",
  "project_schema_overrides",
  "daily_objective_overrides"
]);
export type PurgeDataType = z.infer<typeof purgeDataTypeSchema>;

export const defaultPurgeDataTypes: PurgeDataType[] = [
  "raw_items",
  "entities",
  "memory_records",
  "memory_sources",
  "entity_aliases",
  "review_queue",
  "audit_events",
  "ai_activity_log",
  "ai_operation_policies",
  "agent_runs",
  "ai_processing_runs",
  "ai_processing_schedules",
  "retrieval_logs",
  "schema_definitions",
  "project_schema_overrides",
  "daily_objective_overrides"
];

export const purgeWorkspaceDataSchema = z.object({
  types: z.array(purgeDataTypeSchema).min(1).default(defaultPurgeDataTypes)
});

export const aiProcessingBackfillSchema = z.object({
  rawItemIds: z.array(z.string().uuid()).default([]),
  sourceTypes: z.array(sourceTypeSchema).default([]),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(10000).default(500),
  batchSize: z.coerce.number().int().positive().max(100).default(25),
  onlyUnprocessed: z.boolean().default(true),
  dryRun: z.boolean().default(false)
}).refine((value) => !value.since || !value.until || new Date(value.since) <= new Date(value.until), {
  message: "since must be before until.",
  path: ["until"]
});
export type AiProcessingBackfillInput = z.infer<typeof aiProcessingBackfillSchema>;

export const aiProcessingScheduleSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.coerce.number().int().min(15).max(10080).default(1440),
  sourceTypes: z.array(sourceTypeSchema).default([]),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  batchSize: z.coerce.number().int().positive().max(100).default(25),
  onlyUnprocessed: z.boolean().default(true),
  dryRun: z.boolean().default(false)
});
export type AiProcessingScheduleInput = z.infer<typeof aiProcessingScheduleSchema>;

export const aiAutonomyModeSchema = z.enum(["conservative", "balanced", "autopilot"]);
export const aiOperationPolicyPatchSchema = z.object({
  mode: aiAutonomyModeSchema,
  autoApplyMinConfidence: z.number().min(0).max(1).optional(),
  reviewBelowConfidence: z.number().min(0).max(1).optional(),
  requireReviewForDestructive: z.boolean().optional(),
  requireReviewForSensitive: z.boolean().optional(),
  requireReviewForConflicts: z.boolean().optional(),
  requireReviewForBulkChanges: z.boolean().optional(),
  maxAutoApplyBatchSize: z.coerce.number().int().positive().max(1000).optional()
}).refine((value) => value.reviewBelowConfidence === undefined || value.autoApplyMinConfidence === undefined || value.reviewBelowConfidence <= value.autoApplyMinConfidence, {
  message: "reviewBelowConfidence must be less than or equal to autoApplyMinConfidence.",
  path: ["reviewBelowConfidence"]
});
export type AiOperationPolicyPatchInput = z.infer<typeof aiOperationPolicyPatchSchema>;

export const aiProcessingRunsQuerySchema = z.object({
  status: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25)
});
export type AiProcessingRunsQuery = z.infer<typeof aiProcessingRunsQuerySchema>;

export const createAgentTokenSchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.string().datetime().nullable().optional()
});
export type CreateAgentTokenInput = z.infer<typeof createAgentTokenSchema>;

export const searchQuerySchema = z.object({
  q: z.string().optional(),
  entity_type: entityTypeSchema.optional(),
  project_id: z.string().uuid().optional(),
  status: z.string().optional(),
  due_before: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25)
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const reviewDecisionSchema = z.object({
  editedPayload: z.record(z.unknown()).optional()
});

export const reviewMergeSchema = z.object({
  targetMemoryId: z.string().uuid(),
  editedPayload: z.record(z.unknown()).optional()
});
export type ReviewMergeInput = z.infer<typeof reviewMergeSchema>;

export const reviewSupersedeSchema = z.object({
  targetMemoryId: z.string().uuid(),
  reason: z.string().trim().optional(),
  editedPayload: z.record(z.unknown()).optional()
});
export type ReviewSupersedeInput = z.infer<typeof reviewSupersedeSchema>;

export const memoryConsolidationSchema = z.object({
  dryRun: z.boolean().default(false),
  limit: z.coerce.number().int().positive().max(1000).default(200)
});
export type MemoryConsolidationInput = z.infer<typeof memoryConsolidationSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});
export type LoginInput = z.infer<typeof loginSchema>;

function validateGoogleCalendarEventTime(
  value: {
    start?: string;
    end?: string;
    allDay?: boolean;
  },
  context: z.RefinementCtx
) {
  if (!value.start || !value.end) return;
  const startIsDate = localDateSchema.safeParse(value.start).success;
  const endIsDate = localDateSchema.safeParse(value.end).success;
  const startIsDateTime = googleCalendarDateTimeSchema.safeParse(value.start).success;
  const endIsDateTime = googleCalendarDateTimeSchema.safeParse(value.end).success;

  if (value.allDay) {
    if (!startIsDate || !endIsDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "All-day Google Calendar events require YYYY-MM-DD start and end values.",
        path: ["start"]
      });
      return;
    }
    if (value.start >= value.end) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "All-day event end date must be after start date.",
        path: ["end"]
      });
    }
    return;
  }

  if (!startIsDateTime || !endIsDateTime) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Timed Google Calendar events require ISO date-time start and end values.",
      path: ["start"]
    });
    return;
  }
  if (new Date(value.start) >= new Date(value.end)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Event end time must be after start time.",
      path: ["end"]
    });
  }
}
