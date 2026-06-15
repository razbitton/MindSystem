"use client";

import { useEffect, useState } from "react";
import { CheckCircle, RefreshCw } from "lucide-react";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel, PriorityBadge, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";

export default function ProjectDetailView({ projectId }: { projectId: string }) {
  const { t, formatDate } = useI18n();
  const [data, setData] = useState<AnyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await apiGet(`/api/projects/${projectId}/context`));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("projectDetail.loadError"));
    }
  }

  useEffect(() => {
    void load();
  }, [projectId]);

  async function completeTask(id: string) {
    await apiPost(`/api/tasks/${id}/complete`, {});
    await load();
  }

  return (
    <>
      <PageHeader
        title={data?.project?.name ?? t("projectDetail.fallbackTitle")}
        subtitle={data?.project?.description ?? t("projectDetail.fallbackSubtitle")}
        actions={<button className="button" onClick={load}><RefreshCw size={16} /> {t("common.refresh")}</button>}
      />
      {error ? <EmptyState>{error}</EmptyState> : null}
      <div className="grid two">
        <Panel title={t("projectDetail.summary")}>
          {data?.project ? (
            <div className="row-list">
              <div className="row-item">
                <div>
                  <p className="row-title" dir="auto">{data.project.goal || t("projectDetail.noGoal")}</p>
                  <p className="row-meta">{t("common.due")} {formatDate(data.project.dueAt ?? data.project.due_at)} - {t("common.updated")} {formatDate(data.project.updatedAt ?? data.project.updated_at)}</p>
                </div>
                <div className="toolbar">
                  <PriorityBadge value={data.project.priority} />
                  <StatusBadge value={data.project.status} />
                </div>
              </div>
            </div>
          ) : <EmptyState>{t("projectDetail.loading")}</EmptyState>}
        </Panel>
        <Panel title={t("projectDetail.contextPack")}>
          <pre className="code">{data?.contextPack ?? t("projectDetail.noContextPack")}</pre>
        </Panel>
        <Panel title={t("projectDetail.tasks")}>
          <div className="row-list">
            {(data?.tasks ?? []).map((task: AnyRecord) => (
              <div className="row-item" key={task.id}>
                <div>
                  <p className="row-title" dir="auto">{task.title}</p>
                  <p className="row-meta" dir="auto">{task.description || t("common.noDescription")} - {formatDate(task.dueAt ?? task.due_at)}</p>
                </div>
                <div className="toolbar">
                  <PriorityBadge value={task.priority} />
                  <StatusBadge value={task.status} />
                  {task.status !== "done" ? (
                    <button className="button" title={t("common.complete")} aria-label={t("common.complete")} onClick={() => completeTask(task.id)}>
                      <CheckCircle size={16} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {!(data?.tasks ?? []).length ? <EmptyState>{t("projectDetail.noTasks")}</EmptyState> : null}
          </div>
        </Panel>
        <Panel title={t("projectDetail.notes")}>
          <SimpleRows rows={data?.notes ?? []} titleKey="title" bodyKey="body" emptyText={t("projectDetail.nothingLinked")} formatDate={formatDate} />
        </Panel>
        <Panel title={t("projectDetail.documents")}>
          <SimpleRows rows={data?.documents ?? []} titleKey="title" bodyKey="objectKey" emptyText={t("projectDetail.nothingLinked")} formatDate={formatDate} />
        </Panel>
        <Panel title={t("projectDetail.activity")}>
          <SimpleRows
            rows={[...(data?.tasks ?? []), ...(data?.notes ?? []), ...(data?.documents ?? [])].sort((a, b) => String(b.updatedAt ?? b.updated_at).localeCompare(String(a.updatedAt ?? a.updated_at))).slice(0, 12)}
            titleKey="title"
            bodyKey="updatedAt"
            emptyText={t("projectDetail.nothingLinked")}
            formatDate={formatDate}
          />
        </Panel>
      </div>
    </>
  );
}

function SimpleRows({
  rows,
  titleKey,
  bodyKey,
  emptyText,
  formatDate
}: {
  rows: AnyRecord[];
  titleKey: string;
  bodyKey: string;
  emptyText: string;
  formatDate: (value?: string | null) => string;
}) {
  if (!rows.length) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <div className="row-list">
      {rows.map((row) => {
        const bodyValue = row[bodyKey] ?? row[bodyKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)];
        const shouldFormatDate = bodyKey.toLowerCase().includes("at");
        return (
          <div className="row-item" key={row.id}>
            <div>
              <p className="row-title" dir="auto">{row[titleKey]}</p>
              <p className="row-meta" dir="auto">{shouldFormatDate ? formatDate(bodyValue) : bodyValue}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
