import { dashboardTodayQuerySchema } from "@personal-context-os/shared";
import type { AppContext } from "./types.js";

type DashboardTaskRow = Record<string, unknown>;
type DashboardReminderRow = Record<string, unknown>;
type EnrichedDashboardTaskRow = DashboardTaskRow & {
  objectiveState: string | null;
  objectiveReasons: string[];
  isPinned: boolean;
  isDismissed: boolean;
};

export interface DashboardWindow {
  date: string;
  start: Date;
  end: Date;
  now: Date;
}

const actionableStatuses = new Set(["inbox", "todo", "in_progress"]);
const closedStatuses = new Set(["done", "cancelled"]);
const priorityRank: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};

export async function getDashboard(context: AppContext, query: unknown = {}) {
  const window = resolveDashboardWindow(query);

  const [
    todayTasks,
    overdueTasks,
    urgentTasks,
    dailyTaskCandidates,
    dailyReminders,
    activeProjects,
    recentItems,
    reviewCount
  ] = await Promise.all([
    context.pool.query(
      `select tasks.*, projects.color as project_color, projects.name as project_name from tasks
       left join projects on projects.id = tasks.project_id and projects.workspace_id = tasks.workspace_id
       where tasks.workspace_id = $1 and tasks.status not in ('done', 'cancelled')
       and (tasks.due_at between $2 and $3 or tasks.scheduled_for between $2 and $3)
       order by coalesce(tasks.due_at, tasks.scheduled_for), tasks.priority desc
       limit 25`,
      [context.workspaceId, window.start, window.end]
    ),
    context.pool.query(
      `select tasks.*, projects.color as project_color, projects.name as project_name from tasks
       left join projects on projects.id = tasks.project_id and projects.workspace_id = tasks.workspace_id
       where tasks.workspace_id = $1 and tasks.status not in ('done', 'cancelled') and tasks.due_at < $2
       order by tasks.due_at asc
       limit 25`,
      [context.workspaceId, window.now]
    ),
    context.pool.query(
      `select tasks.*, projects.color as project_color, projects.name as project_name from tasks
       left join projects on projects.id = tasks.project_id and projects.workspace_id = tasks.workspace_id
       where tasks.workspace_id = $1 and tasks.status not in ('done', 'cancelled') and tasks.priority = 'urgent'
       order by tasks.due_at nulls last, tasks.updated_at desc
       limit 25`,
      [context.workspaceId]
    ),
    context.pool.query(
      `select tasks.*, projects.color as project_color, projects.name as project_name,
              daily_objective_overrides.state as objective_state
       from tasks
       left join projects on projects.id = tasks.project_id and projects.workspace_id = tasks.workspace_id
       left join daily_objective_overrides
         on daily_objective_overrides.workspace_id = tasks.workspace_id
        and daily_objective_overrides.task_id = tasks.id
        and daily_objective_overrides.local_date = $4::date
       where tasks.workspace_id = $1
         and tasks.status not in ('done', 'cancelled')
         and coalesce(daily_objective_overrides.state::text, '') <> 'dismissed'
         and (
           tasks.due_at <= $3
           or tasks.scheduled_for between $2 and $3
           or tasks.priority = 'urgent'
           or daily_objective_overrides.state = 'pinned'
         )
       order by tasks.updated_at desc
       limit 100`,
      [context.workspaceId, window.start, window.end, window.date]
    ),
    context.pool.query(
      `select reminders.*, projects.color as project_color, projects.name as project_name
       from reminders
       left join projects on projects.id = reminders.project_id and projects.workspace_id = reminders.workspace_id
       where reminders.workspace_id = $1
         and reminders.status not in ('done', 'cancelled')
         and reminders.remind_at is not null
         and reminders.remind_at <= $2
       order by reminders.remind_at asc
       limit 25`,
      [context.workspaceId, window.end]
    ),
    context.pool.query(
      `select * from projects
       where workspace_id = $1 and status = 'active'
       order by priority desc, updated_at desc
       limit 25`,
      [context.workspaceId]
    ),
    context.pool.query(
      `select id, source_type, raw_text, created_at from raw_items
       where workspace_id = $1
       order by created_at desc
       limit 10`,
      [context.workspaceId]
    ),
    context.pool.query(
      `select count(*)::int as count from review_queue
       where workspace_id = $1 and status = 'pending'`,
      [context.workspaceId]
    )
  ]);

  const dailyAgenda = buildDailyAgenda(dailyTaskCandidates.rows, dailyReminders.rows, window);

  return {
    todayTasks: todayTasks.rows,
    overdueTasks: overdueTasks.rows,
    urgentTasks: urgentTasks.rows,
    activeProjects: activeProjects.rows,
    projectRisk: [],
    recentCapturedItems: recentItems.rows,
    reviewQueueCount: reviewCount.rows[0]?.count ?? 0,
    dashboardDate: window.date,
    dashboardWindow: {
      start: window.start.toISOString(),
      end: window.end.toISOString()
    },
    ...dailyAgenda
  };
}

export function resolveDashboardWindow(query: unknown = {}, now = new Date()): DashboardWindow {
  const parsed = dashboardTodayQuerySchema.parse(query ?? {});
  const date = parsed.date ?? toLocalDate(now);
  const start = parsed.start ? new Date(parsed.start) : parsed.date ? new Date(`${parsed.date}T00:00:00.000Z`) : startOfLocalDay(now);
  const end = parsed.end ? new Date(parsed.end) : parsed.date ? new Date(`${parsed.date}T23:59:59.999Z`) : endOfLocalDay(now);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new Error("Invalid dashboard day window.");
  }

  return { date, start, end, now };
}

export function buildDailyAgenda(
  tasks: DashboardTaskRow[],
  reminders: DashboardReminderRow[],
  window: DashboardWindow
) {
  const enrichedTasks = tasks
    .map((task) => enrichTaskForAgenda(task, window))
    .filter((task) => !task.isDismissed && !closedStatuses.has(taskStatus(task)));
  const sortedTasks = [...enrichedTasks].sort((a, b) => compareDailyTasks(a, b, window));
  const focus = sortedTasks
    .filter((task) => task.isPinned || actionableStatuses.has(taskStatus(task)))
    .slice(0, 8);
  const scheduled = sortedTasks.filter((task) => isScheduledToday(task, window) && taskStatus(task) !== "waiting");
  const deadlines = sortedTasks.filter((task) => hasDeadlineByEndOfDay(task, window) && taskStatus(task) !== "waiting");
  const waiting = sortedTasks.filter((task) => taskStatus(task) === "waiting" && (hasDeadlineByEndOfDay(task, window) || task.priority === "urgent"));
  const enrichedReminders = reminders.map((reminder) => ({
    ...reminder,
    objectiveReasons: ["reminder"]
  }));

  return {
    dailyObjectives: focus,
    dailyObjectiveSections: {
      focus,
      scheduled,
      deadlines,
      waiting,
      reminders: enrichedReminders
    },
    dailyReminders: enrichedReminders,
    objectiveSummary: {
      date: window.date,
      focus: focus.length,
      scheduled: scheduled.length,
      deadlines: deadlines.length,
      waiting: waiting.length,
      reminders: enrichedReminders.length
    }
  };
}

function enrichTaskForAgenda(task: DashboardTaskRow, window: DashboardWindow): EnrichedDashboardTaskRow {
  const objectiveState = stringValue(task, "objective_state") ?? stringValue(task, "objectiveState");
  const dueTime = timeValue(task, "due_at", "dueAt");
  const scheduledTime = timeValue(task, "scheduled_for", "scheduledFor");
  const reasons: string[] = [];

  if (objectiveState === "pinned") reasons.push("pinned");
  if (dueTime !== null && dueTime < window.start.getTime()) reasons.push("overdue");
  if (dueTime !== null && dueTime >= window.start.getTime() && dueTime <= window.end.getTime()) reasons.push("due_today");
  if (scheduledTime !== null && scheduledTime >= window.start.getTime() && scheduledTime <= window.end.getTime()) reasons.push("scheduled_today");
  if (task.priority === "urgent") reasons.push("urgent");
  if (task.status === "in_progress") reasons.push("in_progress");
  if (task.status === "waiting") reasons.push("waiting");

  return {
    ...task,
    objectiveState,
    objectiveReasons: reasons,
    isPinned: objectiveState === "pinned",
    isDismissed: objectiveState === "dismissed"
  } as EnrichedDashboardTaskRow;
}

function compareDailyTasks(a: EnrichedDashboardTaskRow, b: EnrichedDashboardTaskRow, window: DashboardWindow) {
  return (
    booleanSortValue(b.isPinned) - booleanSortValue(a.isPinned) ||
    booleanSortValue(isOverdue(b, window)) - booleanSortValue(isOverdue(a, window)) ||
    booleanSortValue(b.status === "in_progress") - booleanSortValue(a.status === "in_progress") ||
    nullableTimeSortValue(a, "scheduled_for", "scheduledFor") - nullableTimeSortValue(b, "scheduled_for", "scheduledFor") ||
    nullableTimeSortValue(a, "due_at", "dueAt") - nullableTimeSortValue(b, "due_at", "dueAt") ||
    prioritySortValue(a.priority) - prioritySortValue(b.priority) ||
    nullableTimeSortValue(b, "updated_at", "updatedAt") - nullableTimeSortValue(a, "updated_at", "updatedAt")
  );
}

function isOverdue(task: DashboardTaskRow, window: DashboardWindow) {
  const dueTime = timeValue(task, "due_at", "dueAt");
  return dueTime !== null && dueTime < window.start.getTime();
}

function isScheduledToday(task: DashboardTaskRow, window: DashboardWindow) {
  const scheduledTime = timeValue(task, "scheduled_for", "scheduledFor");
  return scheduledTime !== null && scheduledTime >= window.start.getTime() && scheduledTime <= window.end.getTime();
}

function hasDeadlineByEndOfDay(task: DashboardTaskRow, window: DashboardWindow) {
  const dueTime = timeValue(task, "due_at", "dueAt");
  return dueTime !== null && dueTime <= window.end.getTime();
}

function taskStatus(task: DashboardTaskRow) {
  const status = String(task.status ?? "todo");
  return closedStatuses.has(status) ? "done" : status;
}

function prioritySortValue(value: unknown) {
  return priorityRank[String(value ?? "medium")] ?? 2;
}

function booleanSortValue(value: unknown) {
  return value ? 1 : 0;
}

function nullableTimeSortValue(record: DashboardTaskRow, snakeKey: string, camelKey: string) {
  return timeValue(record, snakeKey, camelKey) ?? Number.MAX_SAFE_INTEGER;
}

function timeValue(record: DashboardTaskRow, snakeKey: string, camelKey: string) {
  const value = record[snakeKey] ?? record[camelKey];
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    const time = date.getTime();
    return Number.isNaN(time) ? null : time;
  }
  return null;
}

function stringValue(record: DashboardTaskRow, snakeKey: string, camelKey = snakeKey) {
  const value = record[snakeKey] ?? record[camelKey];
  return typeof value === "string" ? value : null;
}

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function toLocalDate(date: Date) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
}
