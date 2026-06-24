import { normalizerOutputSchema, type NormalizerOutput } from "@personal-context-os/shared";
import type { FreeTextNormalizer } from "./normalizer.js";

const taskPrefixes = /^(?:[-*]\s*)?(?:\[ \]\s*)?(?:(todo|task|next|follow up|fix|write|call|email|ship|build|review|prepare|send|create)\b|(?:משימה|לבצע|לעשות|מעקב))[:\-\s]*/i;
const projectPattern = /\b(?:project|proj)\s*[:\-]\s*([A-Za-z0-9][^\n.;]+)/i;
const explicitNotePattern = /\b(?:note|remember|idea)\s*[:\-]\s*(.+)$/i;
const decisionPattern = /\bdecision\s*[:\-]\s*(.+)$/i;
const reminderPattern = /\bremind(?:er)?\s+(?:me\s+)?(?:to\s+)?(.+?)(?:\s+(tomorrow|today|next week|on \d{4}-\d{2}-\d{2}|at \d{1,2}:\d{2}))?$/i;

type TaskStatus = NormalizerOutput["tasks"][number]["status"];
type TaskPriority = NormalizerOutput["tasks"][number]["priority"];
type TaskKind = NormalizerOutput["tasks"][number]["kind"];

const statusTags = new Map<string, TaskStatus>([
  ["todo", "todo"],
  ["to do", "todo"],
  ["לביצוע", "todo"],
  ["בוצע", "done"],
  ["done", "done"],
  ["complete", "done"],
  ["completed", "done"],
  ["ממתין", "waiting"],
  ["waiting", "waiting"],
  ["בתהליך", "in_progress"],
  ["in progress", "in_progress"],
  ["cancelled", "cancelled"],
  ["canceled", "cancelled"],
  ["בוטל", "cancelled"]
]);
const priorityTags = new Map<string, TaskPriority>([
  ["low", "low"],
  ["נמוך", "low"],
  ["medium", "medium"],
  ["רגיל", "medium"],
  ["high", "high"],
  ["גבוה", "high"],
  ["urgent", "urgent"],
  ["דחוף", "urgent"]
]);
const taskTypeTags = new Map<string, string>([
  ["follow up", "follow_up"],
  ["follow-up", "follow_up"],
  ["מעקב", "follow_up"],
  ["personal", "personal"],
  ["אישי", "personal"],
  ["project", "project"],
  ["פרויקט", "project"]
]);

const taskKindTags = new Map<string, TaskKind>([
  ["one off", "one_off"],
  ["one-off", "one_off"],
  ["single", "one_off"],
  ["finite", "one_off"],
  ["\u05d7\u05d3 \u05e4\u05e2\u05de\u05d9", "one_off"],
  ["\u05d7\u05d3-\u05e4\u05e2\u05de\u05d9", "one_off"],
  ["ongoing", "ongoing"],
  ["continuous", "ongoing"],
  ["recurring", "ongoing"],
  ["\u05de\u05ea\u05de\u05e9\u05da", "ongoing"],
  ["\u05de\u05ea\u05de\u05e9\u05db\u05ea", "ongoing"]
]);

export class HeuristicNormalizer implements FreeTextNormalizer {
  async normalize(input: { text: string; now?: Date; projectHint?: string }): Promise<NormalizerOutput> {
    const now = input.now ?? new Date();
    const text = input.text.trim();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const projectTitle = findProjectTitle(text) ?? input.projectHint;
    const projects: NormalizerOutput["projects"] = [];
    const tasks: NormalizerOutput["tasks"] = [];
    const notes: NormalizerOutput["notes"] = [];
    const reminders: NormalizerOutput["reminders"] = [];
    const decisions: NormalizerOutput["decisions"] = [];
    const people: NormalizerOutput["people"] = [];
    const uncertainties: string[] = [];

    if (projectTitle && !input.projectHint) {
      projects.push({
        title: cleanTitle(projectTitle),
        description: text.length > 160 ? summarize(text) : undefined,
        status: "active",
        priority: inferPriority(text),
        confidence: 0.84,
        customFields: {}
      });
    }

    for (const line of lines) {
      const decision = decisionPattern.exec(line);
      if (decision?.[1]) {
        decisions.push({
          title: cleanTitle(decision[1]),
          body: line,
          projectTitle,
          confidence: 0.82,
          customFields: {}
        });
        continue;
      }

      const reminder = reminderPattern.exec(line);
      if (reminder?.[1]) {
        reminders.push({
          title: cleanTitle(reminder[1]),
          remindAt: inferDate(reminder[2], now),
          projectTitle,
          confidence: reminder[2] ? 0.86 : 0.68,
          customFields: {}
        });
        if (!reminder[2]) {
          uncertainties.push(`Reminder "${cleanTitle(reminder[1])}" has no clear date or time.`);
        }
        continue;
      }

      const taskMatch = taskPrefixes.exec(line);
      if (taskMatch) {
        const metadata = extractTaskMetadata(line.replace(taskPrefixes, ""));
        const title = cleanTitle(metadata.title);
        const dueAt = metadata.kind === "ongoing" ? undefined : inferDate(line, now);
        if (title) {
          tasks.push({
            title,
            description: line,
            projectTitle,
            kind: metadata.kind ?? "one_off",
            status: metadata.status ?? "todo",
            priority: metadata.priority ?? inferPriority(line),
            ...(dueAt ? { dueAt } : {}),
            assignee: metadata.assignee,
            confidence: 0.82,
            customFields: metadata.customFields
          });
        }
        continue;
      }

      const note = explicitNotePattern.exec(line);
      if (note?.[1]) {
        notes.push({
          title: cleanTitle(note[1]).slice(0, 90),
          body: note[1],
          projectTitle,
          confidence: 0.82,
          customFields: {}
        });
      }
    }

    for (const mention of text.matchAll(/@([A-Za-z][A-Za-z0-9_-]{1,40})/g)) {
      if (mention[1]) {
        people.push({ title: mention[1], confidence: 0.78, customFields: {} });
      }
    }

    if (notes.length === 0 && tasks.length === 0 && reminders.length === 0 && projects.length === 0 && decisions.length === 0) {
      notes.push({
        title: summarize(text),
        body: text,
        projectTitle,
        confidence: text.length < 12 ? 0.55 : 0.8,
        customFields: {}
      });
      if (text.length < 12) {
        uncertainties.push("Input is very short, so entity classification is low confidence.");
      }
    }

    if (notes.length === 0 && text.length > 80) {
      notes.push({
        title: summarize(text),
        body: text,
        projectTitle,
        confidence: 0.76,
        customFields: {}
      });
    }

    const entityKinds = [projects.length, tasks.length, notes.length, reminders.length, decisions.length].filter((count) => count > 0).length;
    const intent = inferIntent({ projects, tasks, notes, reminders, entityKinds });
    const confidence = Math.min(
      0.95,
      Math.max(
        0.55,
        averageConfidence([
          ...projects.map((item) => item.confidence),
          ...tasks.map((item) => item.confidence),
          ...notes.map((item) => item.confidence),
          ...reminders.map((item) => item.confidence),
          ...decisions.map((item) => item.confidence)
        ])
      )
    );

    return normalizerOutputSchema.parse({
      intent,
      confidence,
      projects,
      tasks,
      notes,
      reminders,
      people,
      decisions,
      goals: [],
      relationships: [],
      uncertainties
    });
  }
}

function findProjectTitle(text: string): string | undefined {
  const match = projectPattern.exec(text);
  if (match?.[1]) return match[1].trim();
  const forMatch = /\bfor\s+project\s+([A-Za-z0-9][^\n.;]+)/i.exec(text);
  return forMatch?.[1]?.trim();
}

function cleanTitle(value: string): string {
  return value
    .replace(/\b(today|tomorrow|next week|on \d{4}-\d{2}-\d{2}|at \d{1,2}:\d{2})\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[.;,]$/, "")
    .trim();
}

function extractTaskMetadata(value: string): {
  title: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  kind?: TaskKind;
  assignee?: string;
  customFields: Record<string, unknown>;
} {
  let remaining = value.trim();
  const unknownTags: string[] = [];
  let status: TaskStatus | undefined;
  let priority: TaskPriority | undefined;
  let kind: TaskKind | undefined;
  let assignee: string | undefined;
  let taskType: string | undefined;

  while (true) {
    const match = /^\[([^\]\r\n]{1,40})\]\s*/.exec(remaining);
    if (!match?.[1]) break;
    const tag = match[1].trim();
    const normalized = tag.toLowerCase();
    const nextStatus = statusTags.get(normalized);
    const nextPriority = priorityTags.get(normalized);
    const nextType = taskTypeTags.get(normalized);
    const nextKind = taskKindTags.get(normalized);

    if (nextStatus) status = nextStatus;
    else if (nextPriority) priority = nextPriority;
    else if (nextKind) kind = nextKind;
    else if (nextType) taskType = nextType;
    else if (!assignee) assignee = tag;
    else unknownTags.push(tag);

    remaining = remaining.slice(match[0].length).trimStart();
  }

  return {
    title: remaining,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(kind ? { kind } : {}),
    ...(assignee ? { assignee } : {}),
    customFields: {
      ...(taskType ? { taskType } : {}),
      ...(unknownTags.length ? { metadataTags: unknownTags } : {})
    }
  };
}

function summarize(text: string): string {
  const firstLine = text.split(/\r?\n/).find(Boolean) ?? text;
  return cleanTitle(firstLine).slice(0, 90) || "Untitled note";
}

function inferPriority(text: string): "low" | "medium" | "high" | "urgent" {
  if (/\b(urgent|asap|blocker|critical)\b/i.test(text)) return "urgent";
  if (/\b(high priority|important)\b/i.test(text)) return "high";
  if (/\b(low priority|someday)\b/i.test(text)) return "low";
  return "medium";
}

function inferDate(value: string | undefined, now: Date): string | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  const base = new Date(now);
  if (lower.includes("today")) return base.toISOString();
  if (lower.includes("tomorrow")) {
    base.setDate(base.getDate() + 1);
    return base.toISOString();
  }
  if (lower.includes("next week")) {
    base.setDate(base.getDate() + 7);
    return base.toISOString();
  }
  const isoDate = /\b(\d{4}-\d{2}-\d{2})\b/.exec(value);
  if (isoDate?.[1]) return new Date(`${isoDate[1]}T09:00:00.000Z`).toISOString();
  return undefined;
}

function averageConfidence(values: number[]): number {
  if (values.length === 0) return 0.55;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function inferIntent(input: {
  projects: unknown[];
  tasks: unknown[];
  notes: unknown[];
  reminders: unknown[];
  entityKinds: number;
}): NormalizerOutput["intent"] {
  if (input.entityKinds > 1) return "mixed";
  if (input.projects.length > 0) return "create_project";
  if (input.tasks.length > 0) return "add_tasks";
  if (input.reminders.length > 0) return "create_reminder";
  if (input.notes.length > 0) return "capture_note";
  return "unknown";
}
