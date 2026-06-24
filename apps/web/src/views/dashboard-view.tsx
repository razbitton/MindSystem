"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Inbox,
  Pin,
  PinOff,
  Search,
  Send,
  TimerReset,
  type LucideIcon
} from "lucide-react";
import { apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateWorkspaceQueryCache,
  peekCachedQuery,
  setCachedQuery
} from "../lib/query-cache";
import { findProjectForRecord, projectColorClass, projectColorStyle } from "../lib/project-colors";
import { addLocalDays, dateValue, isOngoingTask, localDayQuery, sortByPriority, toLocalDateString, truncate } from "../lib/view-models";
import {
  EmptyState,
  EntityBadge,
  PageHeader,
  Panel,
  PriorityBadge,
  StatusBadge,
  TaskKindBadge
} from "../components/page";
import { useI18n } from "../i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type DashboardViewProps = {
  initialDashboard?: AnyRecord;
  initialNotes?: AnyRecord[];
  initialProjects?: AnyRecord[];
};

export default function DashboardView({
  initialDashboard,
  initialNotes,
  initialProjects
}: DashboardViewProps = {}) {
  const { t, formatDate, translateValue } = useI18n();
  const [data, setData] = useState<AnyRecord | null>(
    () => initialDashboard ?? peekCachedQuery<AnyRecord>("/api/dashboard/today") ?? null
  );
  const [notes, setNotes] = useState<AnyRecord[]>(
    () => initialNotes?.slice(0, 4) ?? peekCachedQuery<{ notes: AnyRecord[] }>("/api/notes")?.notes.slice(0, 4) ?? []
  );
  const [projects, setProjects] = useState<AnyRecord[]>(
    () => initialProjects ?? peekCachedQuery<{ projects: AnyRecord[] }>("/api/projects")?.projects ?? []
  );
  const [captureText, setCaptureText] = useState("");
  const [captureResult, setCaptureResult] = useState<AnyRecord | null>(null);
  const [loadingCapture, setLoadingCapture] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(force = false) {
    setError(null);
    try {
      const dashboardQuery = localDayQuery();
      const [dashboardData, noteData, projectData] = await Promise.all([
        cachedApiGet<AnyRecord>("/api/dashboard/today", dashboardQuery, { force }),
        cachedApiGet<{ notes: AnyRecord[] }>("/api/notes", undefined, { force }),
        cachedApiGet<{ projects: AnyRecord[] }>("/api/projects", undefined, { force })
      ]);
      setData(dashboardData);
      setNotes(noteData.notes.slice(0, 4));
      setProjects(projectData.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.loadError"));
    }
  }

  useEffect(() => {
    if (initialDashboard) {
      setCachedQuery("/api/dashboard/today", undefined, initialDashboard);
      setData(initialDashboard);
    }
    if (initialNotes) {
      setCachedQuery("/api/notes", undefined, { notes: initialNotes });
      setNotes(initialNotes.slice(0, 4));
    }
    if (initialProjects) {
      setCachedQuery("/api/projects", undefined, { projects: initialProjects });
      setProjects(initialProjects);
    }
  }, [initialDashboard, initialNotes, initialProjects]);

  useEffect(() => {
    void load(Boolean(initialDashboard));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function capture() {
    if (!captureText.trim()) return;
    setLoadingCapture(true);
    setError(null);
    try {
      const result = await apiPost("/api/ingest/free-text", { text: captureText, sourceType: "manual" });
      setCaptureResult(result);
      setCaptureText("");
      invalidateWorkspaceQueryCache();
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("inbox.captureFailed"));
    } finally {
      setLoadingCapture(false);
    }
  }

  async function completeTask(id: string) {
    setError(null);
    try {
      await apiPost(`/api/tasks/${id}/complete`, {});
      invalidateWorkspaceQueryCache();
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.failed"));
    }
  }

  async function setDailyObjective(task: AnyRecord, action: "pin" | "snooze" | "clear") {
    setError(null);
    const now = new Date();
    const body: AnyRecord = {
      date: toLocalDateString(now),
      action
    };
    if (action === "snooze") {
      body.targetDate = toLocalDateString(addLocalDays(now, 1));
    }

    try {
      await apiPost(`/api/tasks/${task.id}/daily-objective`, body);
      invalidateWorkspaceQueryCache();
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.failed"));
    }
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={t("home.title")} subtitle={t("home.subtitle")} />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-w-0 max-w-full gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <DailyObjectivesPanel
            data={data}
            formatDate={formatDate}
            onComplete={completeTask}
            onObjectiveAction={setDailyObjective}
          />

          <Panel title={t("home.captureTitle")}>
            <div className="flex min-w-0 max-w-full flex-col gap-3">
              <Textarea
                dir="auto"
                rows={3}
                value={captureText}
                onChange={(event) => setCaptureText(event.target.value)}
                placeholder={t("home.capturePlaceholder")}
              />
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 break-words text-xs text-muted-foreground">{t("home.captureHelp")}</p>
                <Button
                  type="button"
                  size="sm"
                  onClick={capture}
                  disabled={loadingCapture || !captureText.trim()}
                >
                  <Send data-icon="inline-start" />
                  {t("common.capture")}
                </Button>
              </div>
              {captureResult ? (
                <div className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm font-medium text-foreground">{t("home.captureSuccess")}</p>
                    <p className="break-words text-sm text-muted-foreground">
                      {t("inbox.appliedReview", {
                        applied: captureResult.applied ?? 0,
                        review: captureResult.requiresReview ?? 0
                      })}
                    </p>
                  </div>
                  <StatusBadge value={captureResult.requiresReview ? "review" : "created"} />
                </div>
              ) : null}
            </div>
          </Panel>

          <div className="grid min-w-0 max-w-full gap-4 sm:grid-cols-3">
            <MetricCard
              label={t("home.today")}
              value={data?.todayTasks?.length ?? 0}
              help={t("dashboard.scheduledOrDue")}
              icon={ClipboardList}
            />
            <MetricCard
              label={t("home.overdue")}
              value={data?.overdueTasks?.length ?? 0}
              help={t("dashboard.needsAttention")}
              icon={AlertTriangle}
              tone="warning"
            />
            <MetricCard
              label={t("home.review")}
              value={data?.reviewQueueCount ?? 0}
              help={t("dashboard.pendingDecisions")}
              icon={Inbox}
            />
          </div>

          <div className="grid min-w-0 max-w-full gap-6 md:grid-cols-2">
            <Panel title={t("home.urgentTasks")}>
              <TaskRows tasks={data?.urgentTasks ?? []} emptyText={t("home.noUrgentTasks")} formatDate={formatDate} />
            </Panel>
            <Panel
              title={t("home.recentNotes")}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/notes">{t("common.open")}</Link>
                </Button>
              }
            >
              {!notes.length ? (
                <EmptyState>{t("home.noRecentNotes")}</EmptyState>
              ) : (
                <ul className="flex min-w-0 flex-col gap-1">
                  {notes.map((note) => {
                    const linkedProject = findProjectForRecord(projects, note);
                    return (
                    <li key={note.id}>
                      <Link
                        href="/notes"
                          className={cn(
                            "flex min-w-0 items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60",
                            projectColorClass(linkedProject?.color, "row")
                          )}
                          style={projectColorStyle(linkedProject?.color)}
                        >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <p className="truncate text-sm font-medium text-foreground" dir="auto">
                            {note.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground" dir="auto">
                            {truncate(note.body, 90)} · {formatDate(dateValue(note, "updatedAt"))}
                          </p>
                        </div>
                        <div className="shrink-0">
                          <EntityBadge value="note" />
                        </div>
                      </Link>
                    </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            title={t("home.activeProjects")}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/projects">{t("common.open")}</Link>
              </Button>
            }
          >
            <ProjectRows projects={data?.activeProjects ?? []} emptyText={t("home.noProjects")} formatDate={formatDate} />
          </Panel>
          <Panel
            title={t("home.recentCaptures")}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/search">
                  <Search data-icon="inline-start" />
                  {t("common.search")}
                </Link>
              </Button>
            }
          >
            {!data?.recentCapturedItems?.length ? (
              <EmptyState>{t("common.nothingHere")}</EmptyState>
            ) : (
              <ul className="flex min-w-0 flex-col gap-1">
                {(data?.recentCapturedItems ?? []).slice(0, 6).map((item: AnyRecord) => (
                  <li
                    key={item.id}
                    className="flex min-w-0 flex-col gap-0.5 rounded-lg px-3 py-2.5 hover:bg-accent/40"
                  >
                    <p className="break-words text-sm text-foreground" dir="auto">
                      {truncate(item.raw_text, 110)}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      {translateValue("source", item.source_type)} · {formatDate(item.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

type ObjectiveAction = "pin" | "snooze" | "clear";

function DailyObjectivesPanel({
  data,
  formatDate,
  onComplete,
  onObjectiveAction
}: {
  data: AnyRecord | null;
  formatDate: (value?: string | null) => string;
  onComplete: (id: string) => void | Promise<void>;
  onObjectiveAction: (task: AnyRecord, action: ObjectiveAction) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const sections = (data?.dailyObjectiveSections ?? {}) as AnyRecord;
  const summary = (data?.objectiveSummary ?? {}) as AnyRecord;
  const focus = arrayValue(sections.focus ?? data?.dailyObjectives);
  const scheduled = arrayValue(sections.scheduled);
  const deadlines = arrayValue(sections.deadlines);
  const waiting = arrayValue(sections.waiting);
  const reminders = arrayValue(sections.reminders ?? data?.dailyReminders);
  const hasAgenda = focus.length || scheduled.length || deadlines.length || waiting.length || reminders.length;

  return (
    <Panel
      title={t("dashboard.dailyObjectives")}
      action={
        hasAgenda ? (
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
            {t("dashboard.focusCount", { count: Number(summary.focus ?? focus.length) })}
          </span>
        ) : null
      }
    >
      {!hasAgenda ? (
        <EmptyState title={t("dashboard.noDailyObjectives")}>{t("dashboard.noDailyObjectivesBody")}</EmptyState>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <ObjectiveTaskSection
            title={t("dashboard.objectiveFocus")}
            icon={Pin}
            tasks={focus}
            emptyText={t("dashboard.noFocusObjectives")}
            formatDate={formatDate}
            onComplete={onComplete}
            onObjectiveAction={onObjectiveAction}
          />
          <ObjectiveTaskSection
            title={t("dashboard.objectiveScheduled")}
            icon={CalendarClock}
            tasks={scheduled}
            formatDate={formatDate}
            onComplete={onComplete}
            onObjectiveAction={onObjectiveAction}
          />
          <ObjectiveTaskSection
            title={t("dashboard.objectiveDeadlines")}
            icon={AlertTriangle}
            tasks={deadlines}
            formatDate={formatDate}
            onComplete={onComplete}
            onObjectiveAction={onObjectiveAction}
          />
          <ObjectiveTaskSection
            title={t("dashboard.objectiveWaiting")}
            icon={Clock3}
            tasks={waiting}
            formatDate={formatDate}
            onComplete={onComplete}
            onObjectiveAction={onObjectiveAction}
          />
          <ReminderSection reminders={reminders} formatDate={formatDate} />
        </div>
      )}
    </Panel>
  );
}

function ObjectiveTaskSection({
  title,
  icon: Icon,
  tasks,
  emptyText,
  formatDate,
  onComplete,
  onObjectiveAction
}: {
  title: string;
  icon: LucideIcon;
  tasks: AnyRecord[];
  emptyText?: string;
  formatDate: (value?: string | null) => string;
  onComplete: (id: string) => void | Promise<void>;
  onObjectiveAction: (task: AnyRecord, action: ObjectiveAction) => void | Promise<void>;
}) {
  if (!tasks.length && !emptyText) return null;

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span>{title}</span>
      </div>
      {!tasks.length ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {tasks.map((task) => (
            <DailyObjectiveRow
              key={`${title}-${task.id}`}
              task={task}
              formatDate={formatDate}
              onComplete={onComplete}
              onObjectiveAction={onObjectiveAction}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function DailyObjectiveRow({
  task,
  formatDate,
  onComplete,
  onObjectiveAction
}: {
  task: AnyRecord;
  formatDate: (value?: string | null) => string;
  onComplete: (id: string) => void | Promise<void>;
  onObjectiveAction: (task: AnyRecord, action: ObjectiveAction) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const reasons = arrayValue(task.objectiveReasons).map(String);
  const dueAt = dateValue(task, "dueAt");
  const scheduledFor = dateValue(task, "scheduledFor");
  const estimateMinutes = task.estimateMinutes ?? task.estimate_minutes;
  const isPinned = task.isPinned || task.objectiveState === "pinned" || task.objective_state === "pinned";
  const isOngoing = isOngoingTask(task);

  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-background/55 p-3 sm:flex-row sm:items-stretch sm:justify-between",
        projectColorClass(task.projectColor ?? task.project_color, "row")
      )}
      style={projectColorStyle(task.projectColor ?? task.project_color)}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-w-0 items-center">
          <Link href="/tasks" className="min-w-0 flex-1 text-sm font-medium text-foreground hover:underline" dir="auto">
            <span className="line-clamp-2 [overflow-wrap:anywhere]">{task.title}</span>
          </Link>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {!isOngoing && scheduledFor ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <CalendarClock className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{formatDate(scheduledFor)}</span>
            </span>
          ) : null}
          {!isOngoing && dueAt ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <AlertTriangle className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{formatDate(dueAt)}</span>
            </span>
          ) : null}
          {!isOngoing && estimateMinutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3 shrink-0" aria-hidden />
              {t("dashboard.minutes", { count: Number(estimateMinutes) })}
            </span>
          ) : null}
          {task.project_name ? (
            <span className="truncate" dir="auto">
              {task.project_name}
            </span>
          ) : null}
        </div>

        {reasons.length ? (
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {reasons.map((reason) => (
              <ReasonChip key={reason} reason={reason} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2 sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {isOngoing ? <TaskKindBadge value="ongoing" /> : null}
          <PriorityBadge value={task.priority} />
          <StatusBadge value={task.status} />
        </div>

        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            onClick={() => void onObjectiveAction(task, "snooze")}
            title={t("dashboard.snoozeTomorrow")}
            aria-label={t("dashboard.snoozeTomorrow")}
          >
            <TimerReset className="size-[18px]" aria-hidden />
          </Button>
          {isPinned ? (
            <Button
              variant="secondary"
              size="icon-sm"
              type="button"
              onClick={() => void onObjectiveAction(task, "clear")}
              title={t("dashboard.unpinObjective")}
              aria-label={t("dashboard.unpinObjective")}
            >
              <PinOff className="size-[18px]" aria-hidden />
            </Button>
          ) : null}
          {!isOngoing ? (
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={() => void onComplete(String(task.id))}
              title={t("tasks.markDone")}
              aria-label={t("tasks.markDone")}
            >
              <CheckCircle2 className="size-[18px]" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ReminderSection({
  reminders,
  formatDate
}: {
  reminders: AnyRecord[];
  formatDate: (value?: string | null) => string;
}) {
  const { t } = useI18n();
  if (!reminders.length) return null;

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Bell className="size-3.5 shrink-0" aria-hidden />
        <span>{t("dashboard.objectiveReminders")}</span>
      </div>
      <ul className="flex min-w-0 flex-col gap-2">
        {reminders.map((reminder) => (
          <li
            key={reminder.id}
            className={cn(
              "flex min-w-0 items-start justify-between gap-3 rounded-lg border border-border bg-background/55 p-3",
              projectColorClass(reminder.projectColor ?? reminder.project_color, "row")
            )}
            style={projectColorStyle(reminder.projectColor ?? reminder.project_color)}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground" dir="auto">
                {reminder.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(dateValue(reminder, "remindAt"))}
              </p>
            </div>
            <ReasonChip reason="reminder" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReasonChip({ reason }: { reason: string }) {
  const { t } = useI18n();
  return (
    <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
      {t(`objectiveReason.${reason}` as Parameters<typeof t>[0])}
    </span>
  );
}

function arrayValue(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value as AnyRecord[] : [];
}

function MetricCard({
  label,
  value,
  help,
  icon: Icon,
  tone = "primary"
}: {
  label: string;
  value: number;
  help: string;
  icon: LucideIcon;
  tone?: "primary" | "warning";
}) {
  return (
    <section className="bounded-scroll flex min-w-0 max-w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-xs [max-block-size:min(22rem,calc(100svh_-_10rem))]">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="break-words text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="break-words text-xs text-muted-foreground">{help}</p>
      </div>
      <span
        className={
          tone === "warning"
            ? "flex size-10 items-center justify-center rounded-lg bg-warning/15 text-warning"
            : "flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
        }
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
    </section>
  );
}

function TaskRows({
  tasks,
  emptyText,
  formatDate
}: {
  tasks: AnyRecord[];
  emptyText: string;
  formatDate: (value?: string | null) => string;
}) {
  if (!tasks.length) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <ul className="flex min-w-0 flex-col gap-1">
      {sortByPriority(tasks).slice(0, 5).map((task) => (
        <li key={task.id}>
          <Link
            href="/tasks"
            className={cn(
              "flex min-w-0 items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60",
              projectColorClass(task.projectColor ?? task.project_color, "row")
            )}
            style={projectColorStyle(task.projectColor ?? task.project_color)}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-sm font-medium text-foreground" dir="auto">
                {task.title}
              </p>
              <p className="truncate text-xs text-muted-foreground" dir="auto">
                {truncate(task.description, 90)} · {formatDate(dateValue(task, "dueAt") ?? dateValue(task, "scheduledFor"))}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <PriorityBadge value={task.priority} />
              <StatusBadge value={task.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProjectRows({
  projects,
  emptyText,
  formatDate
}: {
  projects: AnyRecord[];
  emptyText: string;
  formatDate: (value?: string | null) => string;
}) {
  if (!projects.length) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <ul className="flex min-w-0 flex-col gap-1">
      {sortByPriority(projects).slice(0, 6).map((project) => (
        <li key={project.id}>
          <Link
            href={`/projects/${project.id}`}
            className={cn(
              "flex min-w-0 items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60",
              projectColorClass(project.color, "row")
            )}
            style={projectColorStyle(project.color)}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-sm font-medium text-foreground" dir="auto">
                {project.name}
              </p>
              <p className="truncate text-xs text-muted-foreground" dir="auto">
                {truncate(project.description || project.goal, 90)} · {formatDate(dateValue(project, "updatedAt"))}
              </p>
            </div>
            <div className="shrink-0">
              <PriorityBadge value={project.priority} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
