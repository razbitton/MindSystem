"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiGet, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel, PriorityBadge, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";

export default function DashboardView() {
  const { t, formatDate, translateValue } = useI18n();
  const [data, setData] = useState<AnyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await apiGet("/api/dashboard/today"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.loadError"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        actions={
          <button className="button" onClick={load}>
            <RefreshCw size={16} /> {t("common.refresh")}
          </button>
        }
      />
      {error ? <EmptyState>{error}</EmptyState> : null}
      <div className="grid three">
        <Panel title={t("dashboard.today")}>
          <p className="metric">{data?.todayTasks?.length ?? 0}</p>
          <p className="row-meta">{t("dashboard.scheduledOrDue")}</p>
        </Panel>
        <Panel title={t("dashboard.overdue")}>
          <p className="metric">{data?.overdueTasks?.length ?? 0}</p>
          <p className="row-meta">{t("dashboard.needsAttention")}</p>
        </Panel>
        <Panel title={t("dashboard.review")}>
          <p className="metric">{data?.reviewQueueCount ?? 0}</p>
          <p className="row-meta">{t("dashboard.pendingDecisions")}</p>
        </Panel>
      </div>
      <div className="grid two" style={{ marginTop: 14 }}>
        <TaskPanel title={t("dashboard.todayTasks")} tasks={data?.todayTasks ?? []} formatDate={formatDate} emptyText={t("common.nothingHere")} />
        <TaskPanel title={t("dashboard.urgentTasks")} tasks={data?.urgentTasks ?? []} formatDate={formatDate} emptyText={t("common.nothingHere")} />
        <Panel title={t("dashboard.activeProjects")}>
          <Rows rows={data?.activeProjects ?? []} titleKey="name" emptyText={t("common.nothingHere")} meta={(row) => <><PriorityBadge value={row.priority} /> <StatusBadge value={row.status} /></>} />
        </Panel>
        <Panel title={t("dashboard.recentCaptures")}>
          <Rows rows={data?.recentCapturedItems ?? []} titleKey="raw_text" emptyText={t("common.nothingHere")} meta={(row) => `${translateValue("source", row.source_type)} - ${formatDate(row.created_at)}`} />
        </Panel>
        <Panel title={t("dashboard.projectRisk")}>
          <EmptyState>{t("dashboard.noRisk")}</EmptyState>
        </Panel>
      </div>
    </>
  );
}

function TaskPanel({
  title,
  tasks,
  formatDate,
  emptyText
}: {
  title: string;
  tasks: AnyRecord[];
  formatDate: (value?: string | null) => string;
  emptyText: string;
}) {
  return (
    <Panel title={title}>
      <Rows
        rows={tasks}
        titleKey="title"
        emptyText={emptyText}
        meta={(row) => (
          <>
            <PriorityBadge value={row.priority} /> <span>{formatDate(row.due_at ?? row.dueAt ?? row.scheduled_for ?? row.scheduledFor)}</span>
          </>
        )}
      />
    </Panel>
  );
}

function Rows({
  rows,
  titleKey,
  meta,
  emptyText
}: {
  rows: AnyRecord[];
  titleKey: string;
  meta: (row: AnyRecord) => React.ReactNode;
  emptyText: string;
}) {
  if (!rows.length) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <div className="row-list">
      {rows.map((row) => (
        <div className="row-item" key={row.id}>
          <div>
            <p className="row-title" dir="auto">{String(row[titleKey]).slice(0, 180)}</p>
            <div className="row-meta">{meta(row)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
