"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardList,
  Inbox,
  RefreshCw,
  Search,
  Send,
  type LucideIcon
} from "lucide-react";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { dateValue, truncate } from "../lib/view-models";
import {
  EmptyState,
  EntityBadge,
  PageHeader,
  Panel,
  PriorityBadge,
  StatusBadge
} from "../components/page";
import { useI18n } from "../i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function DashboardView() {
  const { t, formatDate, translateValue } = useI18n();
  const [data, setData] = useState<AnyRecord | null>(null);
  const [notes, setNotes] = useState<AnyRecord[]>([]);
  const [captureText, setCaptureText] = useState("");
  const [captureResult, setCaptureResult] = useState<AnyRecord | null>(null);
  const [loadingCapture, setLoadingCapture] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [dashboardData, noteData] = await Promise.all([
        apiGet<AnyRecord>("/api/dashboard/today"),
        apiGet<{ notes: AnyRecord[] }>("/api/notes")
      ]);
      setData(dashboardData);
      setNotes(noteData.notes.slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.loadError"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function capture() {
    if (!captureText.trim()) return;
    setLoadingCapture(true);
    setError(null);
    try {
      const result = await apiPost("/api/ingest/free-text", { text: captureText, sourceType: "manual" });
      setCaptureResult(result);
      setCaptureText("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("inbox.captureFailed"));
    } finally {
      setLoadingCapture(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("home.title")}
        subtitle={t("home.subtitle")}
        actions={
          <Button variant="outline" size="sm" type="button" onClick={load}>
            <RefreshCw data-icon="inline-start" />
            {t("common.refresh")}
          </Button>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Panel title={t("home.captureTitle")}>
            <div className="flex flex-col gap-3">
              <Textarea
                dir="auto"
                rows={3}
                value={captureText}
                onChange={(event) => setCaptureText(event.target.value)}
                placeholder={t("home.capturePlaceholder")}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{t("home.captureHelp")}</p>
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
                <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-foreground">{t("home.captureSuccess")}</p>
                    <p className="text-sm text-muted-foreground">
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

          <div className="grid gap-4 sm:grid-cols-3">
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

          <div className="grid gap-6 md:grid-cols-2">
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
                <ul className="flex flex-col gap-1">
                  {notes.map((note) => (
                    <li key={note.id}>
                      <Link
                        href="/notes"
                        className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <p className="truncate text-sm font-medium text-foreground" dir="auto">
                            {note.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground" dir="auto">
                            {truncate(note.body, 90)} · {formatDate(dateValue(note, "updatedAt"))}
                          </p>
                        </div>
                        <EntityBadge value="note" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        <div className="flex flex-col gap-6">
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
              <ul className="flex flex-col gap-1">
                {(data?.recentCapturedItems ?? []).slice(0, 6).map((item: AnyRecord) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 hover:bg-accent/40"
                  >
                    <p className="text-sm text-foreground" dir="auto">
                      {truncate(item.raw_text, 110)}
                    </p>
                    <p className="text-xs text-muted-foreground">
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
    <section className="bounded-scroll flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-xs [max-block-size:min(14rem,calc(100svh_-_14rem))]">
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{help}</p>
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
    <ul className="flex flex-col gap-1">
      {tasks.slice(0, 5).map((task) => (
        <li key={task.id}>
          <Link
            href="/tasks"
            className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-sm font-medium text-foreground" dir="auto">
                {task.title}
              </p>
              <p className="truncate text-xs text-muted-foreground" dir="auto">
                {truncate(task.description, 90)} · {formatDate(dateValue(task, "dueAt") ?? dateValue(task, "scheduledFor"))}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
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
    <ul className="flex flex-col gap-1">
      {projects.slice(0, 6).map((project) => (
        <li key={project.id}>
          <Link
            href={`/projects/${project.id}`}
            className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-sm font-medium text-foreground" dir="auto">
                {project.name}
              </p>
              <p className="truncate text-xs text-muted-foreground" dir="auto">
                {truncate(project.description || project.goal, 90)} · {formatDate(dateValue(project, "updatedAt"))}
              </p>
            </div>
            <PriorityBadge value={project.priority} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
