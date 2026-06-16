"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, RefreshCw } from "lucide-react";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { dateValue, truncate } from "../lib/view-models";
import { EmptyState, IconButton, MetaItem, PageHeader, Panel, PriorityBadge, StatusBadge } from "../components/page";
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

  const project = data?.project;
  const activity = [...(data?.tasks ?? []), ...(data?.notes ?? []), ...(data?.documents ?? [])]
    .sort((a, b) => String(dateValue(b, "updatedAt")).localeCompare(String(dateValue(a, "updatedAt"))))
    .slice(0, 10);

  return (
    <>
      <PageHeader
        eyebrow={t("projects.title")}
        title={project?.name ?? t("projectDetail.fallbackTitle")}
        subtitle={project?.description ?? t("projectDetail.fallbackSubtitle")}
        actions={
          <>
            <Link className="button subtle" href="/projects">{t("projects.title")}</Link>
            <button className="button" type="button" onClick={load}>
              <RefreshCw size={16} aria-hidden /> {t("common.refresh")}
            </button>
          </>
        }
      />
      {error ? <EmptyState>{error}</EmptyState> : null}

      <div className="layout-grid">
        <div className="grid">
          <Panel title={t("projectDetail.summary")}>
            {project ? (
              <div className="item-card">
                <div className="item-card-header">
                  <div>
                    <p className="item-card-title" dir="auto">{project.goal || t("projectDetail.noGoal")}</p>
                    <p className="item-card-body" dir="auto">{project.description || t("common.noDescription")}</p>
                  </div>
                  <div className="toolbar">
                    <PriorityBadge value={project.priority} />
                    <StatusBadge value={project.status} />
                  </div>
                </div>
                <div className="meta-row">
                  <MetaItem label={t("common.due")} value={formatDate(dateValue(project, "dueAt"))} />
                  <MetaItem label={t("common.updated")} value={formatDate(dateValue(project, "updatedAt"))} />
                </div>
              </div>
            ) : (
              <EmptyState>{t("projectDetail.loading")}</EmptyState>
            )}
          </Panel>

          <div className="grid two">
            <Panel title={t("projectDetail.tasks")}>
              <TaskRows tasks={data?.tasks ?? []} formatDate={formatDate} emptyText={t("projectDetail.noTasks")} completeTask={completeTask} />
            </Panel>
            <Panel title={t("projectDetail.notes")}>
              <SimpleRows rows={data?.notes ?? []} titleKey="title" bodyKey="body" emptyText={t("projectDetail.nothingLinked")} formatDate={formatDate} />
            </Panel>
          </div>

          <Panel title={t("projectDetail.activity")}>
            <SimpleRows rows={activity} titleKey="title" bodyKey="updatedAt" emptyText={t("projectDetail.nothingLinked")} formatDate={formatDate} />
          </Panel>
        </div>

        <div className="grid">
          <Panel title={t("projectDetail.documents")}>
            <SimpleRows rows={data?.documents ?? []} titleKey="title" bodyKey="objectKey" emptyText={t("projectDetail.nothingLinked")} formatDate={formatDate} />
          </Panel>
          <details className="advanced-details">
            <summary>{t("projectDetail.contextPack")}</summary>
            <div className="panel-body">
              <p className="row-meta">{t("projectDetail.contextHelp")}</p>
              <pre className="code">{data?.contextPack ?? t("projectDetail.noContextPack")}</pre>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}

function TaskRows({
  tasks,
  formatDate,
  emptyText,
  completeTask
}: {
  tasks: AnyRecord[];
  formatDate: (value?: string | null) => string;
  emptyText: string;
  completeTask: (id: string) => void;
}) {
  const { t } = useI18n();
  if (!tasks.length) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <div className="row-list">
      {tasks.map((task) => (
        <div className="row-item" key={task.id}>
          <div>
            <p className="row-title" dir="auto">{task.title}</p>
            <p className="row-meta" dir="auto">{truncate(task.description, 130) || t("common.noDescription")} - {formatDate(dateValue(task, "dueAt"))}</p>
          </div>
          <div className="toolbar">
            <PriorityBadge value={task.priority} />
            <StatusBadge value={task.status} />
            {task.status !== "done" ? (
              <IconButton label={t("common.complete")} onClick={() => completeTask(task.id)}>
                <CheckCircle size={16} aria-hidden />
              </IconButton>
            ) : null}
          </div>
        </div>
      ))}
    </div>
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
        const bodyValue = bodyKey.toLowerCase().includes("at") ? formatDate(dateValue(row, bodyKey)) : row[bodyKey] ?? row[bodyKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)];
        return (
          <div className="row-item" key={row.id}>
            <div>
              <p className="row-title" dir="auto">{row[titleKey] ?? row.name}</p>
              <p className="row-meta" dir="auto">{truncate(String(bodyValue ?? ""), 180)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
