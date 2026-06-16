"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardList, Inbox, RefreshCw, Search, Send, StickyNote } from "lucide-react";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { dateValue, truncate } from "../lib/view-models";
import { EmptyState, EntityBadge, PageHeader, Panel, PriorityBadge, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";

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
    <>
      <PageHeader
        eyebrow={t("app.name")}
        title={t("home.title")}
        subtitle={t("home.subtitle")}
        actions={
          <button className="button" type="button" onClick={load}>
            <RefreshCw size={16} aria-hidden /> {t("common.refresh")}
          </button>
        }
      />
      {error ? <EmptyState>{error}</EmptyState> : null}

      <div className="layout-grid">
        <div className="grid">
          <Panel title={t("home.captureTitle")}>
            <div className="capture-composer">
              <textarea
                className="textarea"
                dir="auto"
                value={captureText}
                onChange={(event) => setCaptureText(event.target.value)}
                placeholder={t("home.capturePlaceholder")}
              />
              <div className="toolbar space-between">
                <p className="row-meta">{t("home.captureHelp")}</p>
                <button className="button primary" type="button" onClick={capture} disabled={loadingCapture || !captureText.trim()}>
                  <Send size={16} aria-hidden /> {t("common.capture")}
                </button>
              </div>
              {captureResult ? (
                <div className="item-card">
                  <div className="item-card-header">
                    <div>
                      <p className="item-card-title">{t("home.captureSuccess")}</p>
                      <p className="item-card-body">{t("inbox.appliedReview", { applied: captureResult.applied ?? 0, review: captureResult.requiresReview ?? 0 })}</p>
                    </div>
                    <StatusBadge value={captureResult.requiresReview ? "review" : "created"} />
                  </div>
                </div>
              ) : null}
            </div>
          </Panel>

          <div className="grid three">
            <MetricCard
              label={t("home.today")}
              value={data?.todayTasks?.length ?? 0}
              help={t("dashboard.scheduledOrDue")}
              icon={<ClipboardList size={19} aria-hidden />}
            />
            <MetricCard
              label={t("home.overdue")}
              value={data?.overdueTasks?.length ?? 0}
              help={t("dashboard.needsAttention")}
              icon={<AlertTriangle size={19} aria-hidden />}
            />
            <MetricCard
              label={t("home.review")}
              value={data?.reviewQueueCount ?? 0}
              help={t("dashboard.pendingDecisions")}
              icon={<Inbox size={19} aria-hidden />}
            />
          </div>

          <div className="grid two">
            <Panel title={t("home.urgentTasks")}>
              <TaskRows tasks={data?.urgentTasks ?? []} emptyText={t("home.noUrgentTasks")} formatDate={formatDate} />
            </Panel>
            <Panel title={t("home.recentNotes")} action={<Link className="button subtle" href="/notes">{t("common.open")}</Link>}>
              {!notes.length ? <EmptyState>{t("home.noRecentNotes")}</EmptyState> : null}
              <div className="row-list">
                {notes.map((note) => (
                  <Link className="row-item" href="/notes" key={note.id}>
                    <div>
                      <p className="row-title" dir="auto">{note.title}</p>
                      <p className="row-meta" dir="auto">{truncate(note.body, 150)} - {formatDate(dateValue(note, "updatedAt"))}</p>
                    </div>
                    <EntityBadge value="note" />
                  </Link>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        <div className="grid">
          <Panel title={t("home.activeProjects")} action={<Link className="button subtle" href="/projects">{t("common.open")}</Link>}>
            <ProjectRows projects={data?.activeProjects ?? []} emptyText={t("home.noProjects")} formatDate={formatDate} />
          </Panel>
          <Panel title={t("home.recentCaptures")} action={<Link className="button subtle" href="/search"><Search size={15} aria-hidden />{t("common.search")}</Link>}>
            {!data?.recentCapturedItems?.length ? <EmptyState>{t("common.nothingHere")}</EmptyState> : null}
            <div className="row-list">
              {(data?.recentCapturedItems ?? []).slice(0, 6).map((item: AnyRecord) => (
                <div className="row-item" key={item.id}>
                  <div>
                    <p className="row-title" dir="auto">{truncate(item.raw_text, 120)}</p>
                    <p className="row-meta">{translateValue("source", item.source_type)} - {formatDate(item.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function MetricCard({ label, value, help, icon }: { label: string; value: number; help: string; icon: React.ReactNode }) {
  return (
    <section className="metric-card">
      <div className="metric-copy">
        <p className="metric-label">{label}</p>
        <p className="metric-value">{value}</p>
        <p className="metric-help">{help}</p>
      </div>
      <div className="metric-icon">{icon}</div>
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
    <div className="row-list">
      {tasks.slice(0, 5).map((task) => (
        <Link className="row-item" href="/tasks" key={task.id}>
          <div>
            <p className="row-title" dir="auto">{task.title}</p>
            <p className="row-meta" dir="auto">{truncate(task.description, 120)} - {formatDate(dateValue(task, "dueAt") ?? dateValue(task, "scheduledFor"))}</p>
          </div>
          <div className="toolbar">
            <PriorityBadge value={task.priority} />
            <StatusBadge value={task.status} />
          </div>
        </Link>
      ))}
    </div>
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
    <div className="row-list">
      {projects.slice(0, 6).map((project) => (
        <Link className="row-item" href={`/projects/${project.id}`} key={project.id}>
          <div>
            <p className="row-title" dir="auto">{project.name}</p>
            <p className="row-meta" dir="auto">{truncate(project.description || project.goal, 120)} - {formatDate(dateValue(project, "updatedAt"))}</p>
          </div>
          <PriorityBadge value={project.priority} />
        </Link>
      ))}
    </div>
  );
}
