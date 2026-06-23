"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Trash2 } from "lucide-react";
import { apiDelete, apiPatch, apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateWorkspaceQueryCache,
  peekCachedQuery
} from "../lib/query-cache";
import { projectColorClass, projectColorStyle } from "../lib/project-colors";
import { dateValue, sortByPriority, truncate } from "../lib/view-models";
import { EmptyState, IconButton, MetaItem, PageHeader, Panel, PriorityBadge, StatusBadge } from "../components/page";
import { ConfirmDialog } from "../components/confirm-dialog";
import { TaskDetailDialog } from "../components/task-detail-dialog";
import { TaskEditorDrawer, type TaskEditorPayload } from "../components/task-editor-drawer";
import { Disclosure, CodeBlock } from "../components/disclosure";
import { useI18n } from "../i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DeleteTarget = {
  type: "project" | "task" | "note";
  id: string;
  title: string;
};

export default function ProjectDetailView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { t, formatDate } = useI18n();
  const [data, setData] = useState<AnyRecord | null>(
    () => peekCachedQuery<AnyRecord>(`/api/projects/${projectId}/context`) ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [viewingTask, setViewingTask] = useState<AnyRecord | null>(null);
  const [editingTask, setEditingTask] = useState<AnyRecord | null>(null);
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    setViewingTask((current) => (current?.id === id ? { ...current, status: "done" } : current));
  }

  function openTaskDetails(task: AnyRecord) {
    setViewingTask(task);
  }

  function closeTaskDetails() {
    setViewingTask(null);
  }

  function openTaskEdit(task: AnyRecord) {
    setViewingTask(null);
    setEditingTask(task);
    setTaskEditorOpen(true);
  }

  function closeTaskEditor() {
    setTaskEditorOpen(false);
    setEditingTask(null);
  }

  async function saveTask(payload: TaskEditorPayload, task: AnyRecord | null) {
    const targetTask = task ?? editingTask;
    if (!targetTask) return;
    await apiPatch(`/api/tasks/${targetTask.id}`, payload);
    closeTaskEditor();
    invalidateWorkspaceQueryCache();
    await load(true);
  }

  function requestDelete(type: DeleteTarget["type"], item: AnyRecord, event?: { stopPropagation: () => void }) {
    event?.stopPropagation();
    setDeleteTarget({
      type,
      id: String(item.id),
      title: String(item.title ?? item.name ?? t(`entity.${type}` as "entity.project" | "entity.task" | "entity.note"))
    });
  }

  async function deleteSelected() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const path =
        deleteTarget.type === "project"
          ? `/api/projects/${deleteTarget.id}`
          : deleteTarget.type === "task"
            ? `/api/tasks/${deleteTarget.id}`
            : `/api/notes/${deleteTarget.id}`;
      await apiDelete(path);
      if (deleteTarget.type === "task" && viewingTask?.id === deleteTarget.id) closeTaskDetails();
      if (deleteTarget.type === "task" && editingTask?.id === deleteTarget.id) closeTaskEditor();
      setDeleteTarget(null);
      invalidateWorkspaceQueryCache();
      if (path.startsWith("/api/projects/")) {
        router.push("/projects");
      } else {
        await load(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
    } finally {
      setDeleting(false);
    }
  }

  const project = data?.project;
  const activity = [...(data?.tasks ?? []), ...(data?.notes ?? []), ...(data?.documents ?? [])]
    .sort((a, b) => String(dateValue(b, "updatedAt")).localeCompare(String(dateValue(a, "updatedAt"))))
    .slice(0, 10);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6 overflow-hidden">
      <PageHeader
        backHref="/projects"
        backLabel={t("common.back")}
        eyebrow={t("projects.title")}
        title={project?.name ?? t("projectDetail.fallbackTitle")}
        subtitle={project?.description ?? t("projectDetail.fallbackSubtitle")}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-w-0 max-w-full gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 max-w-full flex-col gap-6 lg:col-span-2">
          <Panel title={t("projectDetail.summary")} className={projectColorClass(project?.color, "card")} style={projectColorStyle(project?.color)}>
            {project ? (
              <div className="flex min-w-0 max-w-full flex-col gap-3">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="break-words text-sm font-semibold text-foreground [overflow-wrap:anywhere]" dir="auto">
                      {project.goal || t("projectDetail.noGoal")}
                    </p>
                    <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]" dir="auto">
                      {project.description || t("common.noDescription")}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:shrink-0">
                    <PriorityBadge value={project.priority} />
                    <StatusBadge value={project.status} />
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3">
                  <MetaItem label={t("common.due")} value={formatDate(dateValue(project, "dueAt"))} />
                  <MetaItem label={t("common.updated")} value={formatDate(dateValue(project, "updatedAt"))} />
                </div>
              </div>
            ) : (
              <EmptyState>{t("projectDetail.loading")}</EmptyState>
            )}
          </Panel>

          <div className="grid min-w-0 max-w-full gap-6 md:grid-cols-2">
            <Panel title={t("projectDetail.tasks")} className={projectColorClass(project?.color, "card")} style={projectColorStyle(project?.color)}>
              <TaskRows
                tasks={data?.tasks ?? []}
                projectColor={project?.color}
                formatDate={formatDate}
                emptyText={t("projectDetail.noTasks")}
                completeTask={completeTask}
                openTask={openTaskDetails}
                deleteTask={(task, event) => requestDelete("task", task, event)}
              />
            </Panel>
            <Panel title={t("projectDetail.notes")} className={projectColorClass(project?.color, "card")} style={projectColorStyle(project?.color)}>
              <SimpleRows
                rows={data?.notes ?? []}
                projectColor={project?.color}
                titleKey="title"
                bodyKey="body"
                emptyText={t("projectDetail.nothingLinked")}
                formatDate={formatDate}
                deleteRow={(note) => requestDelete("note", note)}
              />
            </Panel>
          </div>

          <Panel title={t("projectDetail.activity")} className={projectColorClass(project?.color, "card")} style={projectColorStyle(project?.color)}>
            <SimpleRows
              rows={activity}
              projectColor={project?.color}
              titleKey="title"
              bodyKey="updatedAt"
              emptyText={t("projectDetail.nothingLinked")}
              formatDate={formatDate}
            />
          </Panel>
        </div>

        <div className="flex min-w-0 max-w-full flex-col gap-6">
          <Panel title={t("projectDetail.documents")} className={projectColorClass(project?.color, "card")} style={projectColorStyle(project?.color)}>
            <SimpleRows
              rows={data?.documents ?? []}
              projectColor={project?.color}
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

      {project ? (
        <section className="flex min-w-0 max-w-full justify-center border-t border-border pt-4 sm:justify-start">
          <Button
            variant="delete"
            size="sm"
            type="button"
            className="w-full justify-center sm:w-fit"
            onClick={() => requestDelete("project", project)}
          >
            <Trash2 data-icon="inline-start" />
            {t("common.delete")}
          </Button>
        </section>
      ) : null}

      <TaskDetailDialog
        open={Boolean(viewingTask)}
        task={viewingTask}
        projects={project ? [project] : []}
        onClose={closeTaskDetails}
        onEdit={openTaskEdit}
        onComplete={completeTask}
        onDelete={(task) => {
          closeTaskDetails();
          requestDelete("task", task);
        }}
      />

      <TaskEditorDrawer
        open={taskEditorOpen}
        task={editingTask}
        projects={project ? [project] : []}
        defaultProjectId={String(project?.id ?? "")}
        onClose={closeTaskEditor}
        onSave={saveTask}
        onDelete={(task) => requestDelete("task", task)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget?.type === "project"
            ? t("projects.deleteProject")
            : deleteTarget?.type === "task"
              ? t("tasks.deleteTask")
              : t("notes.deleteNote")
        }
        description={
          deleteTarget?.type === "project"
            ? t("projects.deleteConfirm", { title: deleteTarget.title })
            : deleteTarget?.type === "task"
              ? t("tasks.deleteConfirm", { title: deleteTarget.title })
              : t("notes.deleteConfirm", { title: deleteTarget?.title ?? t("entity.note") })
        }
        confirmLabel={deleting ? t("common.deleting") : t("common.delete")}
        destructive
        loading={deleting}
        onConfirm={() => void deleteSelected()}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function TaskRows({
  tasks,
  projectColor,
  formatDate,
  emptyText,
  completeTask,
  openTask,
  deleteTask
}: {
  tasks: AnyRecord[];
  projectColor?: unknown;
  formatDate: (value?: string | null) => string;
  emptyText: string;
  completeTask: (id: string) => void;
  openTask: (task: AnyRecord) => void;
  deleteTask: (task: AnyRecord, event?: { stopPropagation: () => void }) => void;
}) {
  const { t } = useI18n();
  if (!tasks.length) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <ul className="flex min-w-0 max-w-full flex-col gap-1">
      {sortByPriority(tasks).map((task) => (
        <li
          key={task.id}
          role="button"
          tabIndex={0}
          aria-label={`${t("common.open")}: ${String(task.title ?? t("entity.task"))}`}
          className={cn(
            "flex min-w-0 max-w-full cursor-pointer flex-col gap-2 overflow-hidden rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-start sm:justify-between",
            projectColorClass(projectColor, "row")
          )}
          style={projectColorStyle(projectColor)}
          onClick={() => openTask(task)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openTask(task);
            }
          }}
        >
          <div className="flex min-w-0 max-w-full flex-col gap-0.5">
            <p className="truncate text-sm font-medium text-foreground" dir="auto">
              {task.title}
            </p>
            <p className="truncate text-xs text-muted-foreground" dir="auto">
              {truncate(task.description, 110) || t("common.noDescription")} · {formatDate(dateValue(task, "dueAt"))}
            </p>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5 sm:w-auto sm:shrink-0 sm:justify-end">
            <PriorityBadge value={task.priority} />
            <StatusBadge value={task.status} />
            {task.status !== "done" ? (
              <IconButton
                label={t("common.complete")}
                onClick={(event) => {
                  event.stopPropagation();
                  completeTask(task.id);
                }}
              >
                <CheckCircle className="size-4" aria-hidden />
              </IconButton>
            ) : null}
            <IconButton
              label={t("common.delete")}
              action="delete"
              onClick={(event) => deleteTask(task, event)}
            >
              <Trash2 className="size-4" aria-hidden />
            </IconButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SimpleRows({
  rows,
  projectColor,
  titleKey,
  bodyKey,
  emptyText,
  formatDate,
  deleteRow
}: {
  rows: AnyRecord[];
  projectColor?: unknown;
  titleKey: string;
  bodyKey: string;
  emptyText: string;
  formatDate: (value?: string | null) => string;
  deleteRow?: (row: AnyRecord) => void;
}) {
  const { t } = useI18n();
  if (!rows.length) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <ul className="flex min-w-0 max-w-full flex-col gap-1">
      {rows.map((row) => {
        const bodyValue = bodyKey.toLowerCase().includes("at")
          ? formatDate(dateValue(row, bodyKey))
          : row[bodyKey] ?? row[bodyKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)];
        return (
          <li
            key={row.id}
            className={cn(
              "flex min-w-0 max-w-full items-start justify-between gap-3 overflow-hidden rounded-lg px-3 py-2.5 hover:bg-accent/40",
              projectColorClass(projectColor, "row")
            )}
            style={projectColorStyle(projectColor)}
          >
            <div className="flex min-w-0 max-w-full flex-col gap-0.5">
              <p className="truncate text-sm font-medium text-foreground" dir="auto">
                {row[titleKey] ?? row.name}
              </p>
              <p className="truncate text-xs text-muted-foreground" dir="auto">
                {truncate(String(bodyValue ?? ""), 160)}
              </p>
            </div>
            {deleteRow ? (
              <IconButton
                label={t("common.delete")}
                action="delete"
                className="shrink-0"
                onClick={() => deleteRow(row)}
              >
                <Trash2 className="size-4" aria-hidden />
              </IconButton>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
