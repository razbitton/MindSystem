"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, RefreshCw } from "lucide-react";
import { apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateWorkspaceQueryCache,
  peekCachedQuery
} from "../lib/query-cache";
import { dateValue, truncate } from "../lib/view-models";
import { EmptyState, IconButton, MetaItem, PageHeader, Panel, PriorityBadge, StatusBadge } from "../components/page";
import { Disclosure, CodeBlock } from "../components/disclosure";
import { useI18n } from "../i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ProjectDetailView({ projectId }: { projectId: string }) {
  const { t, formatDate } = useI18n();
  const [data, setData] = useState<AnyRecord | null>(
    () => peekCachedQuery<AnyRecord>(`/api/projects/${projectId}/context`) ?? null
  );
  const [error, setError] = useState<string | null>(null);

  async function load(force = false) {
    setError(null);
    try {
      setData(await cachedApiGet(`/api/projects/${projectId}/context`, undefined, { force }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("projectDetail.loadError"));
    }
  }

  useEffect(() => {
    void load();
  }, [projectId]);

  async function completeTask(id: string) {
    await apiPost(`/api/tasks/${id}/complete`, {});
    invalidateWorkspaceQueryCache();
    await load(true);
  }

  const project = data?.project;
  const activity = [...(data?.tasks ?? []), ...(data?.notes ?? []), ...(data?.documents ?? [])]
    .sort((a, b) => String(dateValue(b, "updatedAt")).localeCompare(String(dateValue(a, "updatedAt"))))
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("projects.title")}
        title={project?.name ?? t("projectDetail.fallbackTitle")}
        subtitle={project?.description ?? t("projectDetail.fallbackSubtitle")}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/projects">{t("projects.title")}</Link>
            </Button>
            <Button variant="outline" size="sm" type="button" onClick={() => load(true)}>
              <RefreshCw data-icon="inline-start" />
              {t("common.refresh")}
            </Button>
          </>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Panel title={t("projectDetail.summary")}>
            {project ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-sm font-semibold text-foreground" dir="auto">
                      {project.goal || t("projectDetail.noGoal")}
                    </p>
                    <p className="text-sm text-muted-foreground" dir="auto">
                      {project.description || t("common.noDescription")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PriorityBadge value={project.priority} />
                    <StatusBadge value={project.status} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3">
                  <MetaItem label={t("common.due")} value={formatDate(dateValue(project, "dueAt"))} />
                  <MetaItem label={t("common.updated")} value={formatDate(dateValue(project, "updatedAt"))} />
                </div>
              </div>
            ) : (
              <EmptyState>{t("projectDetail.loading")}</EmptyState>
            )}
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel title={t("projectDetail.tasks")}>
              <TaskRows
                tasks={data?.tasks ?? []}
                formatDate={formatDate}
                emptyText={t("projectDetail.noTasks")}
                completeTask={completeTask}
              />
            </Panel>
            <Panel title={t("projectDetail.notes")}>
              <SimpleRows
                rows={data?.notes ?? []}
                titleKey="title"
                bodyKey="body"
                emptyText={t("projectDetail.nothingLinked")}
                formatDate={formatDate}
              />
            </Panel>
          </div>

          <Panel title={t("projectDetail.activity")}>
            <SimpleRows
              rows={activity}
              titleKey="title"
              bodyKey="updatedAt"
              emptyText={t("projectDetail.nothingLinked")}
              formatDate={formatDate}
            />
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title={t("projectDetail.documents")}>
            <SimpleRows
              rows={data?.documents ?? []}
              titleKey="title"
              bodyKey="objectKey"
              emptyText={t("projectDetail.nothingLinked")}
              formatDate={formatDate}
            />
          </Panel>
          <Panel>
            <Disclosure label={t("projectDetail.contextPack")}>
              <p className="pb-2 text-xs text-muted-foreground">{t("projectDetail.contextHelp")}</p>
              <CodeBlock>{data?.contextPack ?? t("projectDetail.noContextPack")}</CodeBlock>
            </Disclosure>
          </Panel>
        </div>
      </div>
    </div>
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
    <ul className="flex flex-col gap-1">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/40">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate text-sm font-medium text-foreground" dir="auto">
              {task.title}
            </p>
            <p className="truncate text-xs text-muted-foreground" dir="auto">
              {truncate(task.description, 110) || t("common.noDescription")} · {formatDate(dateValue(task, "dueAt"))}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PriorityBadge value={task.priority} />
            <StatusBadge value={task.status} />
            {task.status !== "done" ? (
              <IconButton label={t("common.complete")} onClick={() => completeTask(task.id)}>
                <CheckCircle className="size-4" aria-hidden />
              </IconButton>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
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
    <ul className="flex flex-col gap-1">
      {rows.map((row) => {
        const bodyValue = bodyKey.toLowerCase().includes("at")
          ? formatDate(dateValue(row, bodyKey))
          : row[bodyKey] ?? row[bodyKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)];
        return (
          <li key={row.id} className="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 hover:bg-accent/40">
            <p className="truncate text-sm font-medium text-foreground" dir="auto">
              {row[titleKey] ?? row.name}
            </p>
            <p className="truncate text-xs text-muted-foreground" dir="auto">
              {truncate(String(bodyValue ?? ""), 160)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
