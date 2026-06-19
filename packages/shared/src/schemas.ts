import { z } from "zod";

export const sourceTypeSchema = z.enum(["web", "whatsapp", "openclaw", "codex", "api", "manual"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const entityTypeSchema = z.enum([
  "project",
  "task",
  "note",
  "document",
  "decision",
  "reminder",
  "person",
  "goal"
]);
export type EntityType = z.infer<typeof entityTypeSchema>;

export const projectStatusSchema = z.enum(["active", "paused", "completed", "archived"]);
export const taskStatusSchema = z.enum(["inbox", "todo", "in_progress", "waiting", "done", "cancelled"]);
export const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const relationTypeSchema = z.enum([
  "belongs_to",
  "depends_on",
  "mentions",
  "blocks",
  "derived_from",
  "related_to"
]);

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
  status: projectStatusSchema.default("active"),
  priority: prioritySchema.default("medium"),
  dueAt: z.string().datetime().optional()
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const patchProjectSchema = createProjectSchema.partial();

export const createTaskSchema = z.object({
  title: taskTitleSchema,
  description: z.string().optional(),
  projectId: z.string().uuid().nullable().optional(),
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
  "review_queue",
  "audit_events",
  "agent_runs",
  "retrieval_logs",
  "schema_definitions",
  "project_schema_overrides"
]);
export type PurgeDataType = z.infer<typeof purgeDataTypeSchema>;

export const defaultPurgeDataTypes: PurgeDataType[] = [
  "raw_items",
  "entities",
  "review_queue",
  "audit_events",
  "agent_runs",
  "retrieval_logs",
  "schema_definitions",
  "project_schema_overrides"
];

export const purgeWorkspaceDataSchema = z.object({
  types: z.array(purgeDataTypeSchema).min(1).default(defaultPurgeDataTypes)
});

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

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});
export type LoginInput = z.infer<typeof loginSchema>;
