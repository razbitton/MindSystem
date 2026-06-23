"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Filter, Plus, Search, Trash2 } from "lucide-react";
import { apiDelete, apiPatch, apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateCachedQueries,
  peekCachedQuery,
  setCachedQuery
} from "../lib/query-cache";
import {
  dateValue,
  matchesQuery,
  projectName,
  sortByPriority,
  truncate
} from "../lib/view-models";
import { findProjectForRecord, projectColorClass, projectColorStyle, projectColorValue } from "../lib/project-colors";
import { EmptyState } from "../components/page";
import { ConfirmDialog } from "../components/confirm-dialog";
import { TaskDetailDialog } from "../components/task-detail-dialog";
import { TaskEditorDrawer, type TaskEditorPayload } from "../components/task-editor-drawer";
import { useI18n } from "../i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";

const statuses = ["inbox", "todo", "in_progress", "waiting", "done", "cancelled"] as const;
const priorities = ["low", "medium", "high", "urgent"] as const;
const ANY = "__any__";
type TaskFilters = { status: string; project_id: string; priority: string };
const defaultTaskFilters: TaskFilters = { status: "", project_id: "", priority: "" };

type TasksViewProps = {
  initialTasks?: AnyRecord[];
  initialProjects?: AnyRecord[];
};

export default function TasksView({ initialTasks, initialProjects }: TasksViewProps = {}) {
  const { t, formatDate, translateValue, direction } = useI18n();
  const [tasks, setTasks] = useState<AnyRecord[]>(
    () => initialTasks ?? peekCachedQuery<{ tasks: AnyRecord[] }>("/api/tasks", defaultTaskFilters)?.tasks ?? []
  );
  const [projects, setProjects] = useState<AnyRecord[]>(
    () => initialProjects ?? peekCachedQuery<{ projects: AnyRecord[] }>("/api/projects")?.projects ?? []
  );
  const [filters, setFilters] = useState(defaultTaskFilters);
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [editingTask, setEditingTask] = useState<AnyRecord | null>(null);
  const [viewingTask, setViewingTask] = useState<AnyRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnyRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load(nextFilters = filters, force = false) {
    const [taskData, projectData] = await Promise.all([
      cachedApiGet<{ tasks: AnyRecord[] }>("/api/tasks", nextFilters, { force }),
      cachedApiGet<{ projects: AnyRecord[] }>("/api/projects", undefined, { force })
    ]);
    setTasks(taskData.tasks);
    setProjects(projectData.projects);
  }

  function invalidateTaskQueryCache() {
    invalidateCachedQueries((key) =>
      key.startsWith("GET /api/tasks") ||
      key.startsWith("GET /api/dashboard") ||
      key.startsWith("GET /api/projects/")
    );
  }

  useEffect(() => {
    if (initialTasks) {
      setCachedQuery("/api/tasks", defaultTaskFilters, { tasks: initialTasks });
      setTasks(initialTasks);
    }
    if (initialProjects) {
      setCachedQuery("/api/projects", undefined, { projects: initialProjects });
      setProjects(initialProjects);
    }
  }, [initialTasks, initialProjects]);

  useEffect(() => {
    if (initialTasks && initialProjects) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditingTask(null);
    setViewingTask(null);
    setDrawerOpen(true);
  }

  function openEdit(task: AnyRecord) {
    setViewingTask(null);
    setEditingTask(task);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingTask(null);
  }

  function openTaskDetails(task: AnyRecord) {
    setViewingTask(task);
  }

  function closeTaskDetails() {
    setViewingTask(null);
  }

  async function save(payload: TaskEditorPayload, task: AnyRecord | null) {
    const targetTask = task ?? editingTask;
    if (targetTask) {
      await apiPatch(`/api/tasks/${targetTask.id}`, payload);
    } else {
      await apiPost("/api/tasks", payload);
    }
    closeDrawer();
    invalidateTaskQueryCache();
    await load(filters, true);
  }

  async function complete(id: string) {
    await apiPost(`/api/tasks/${id}/complete`, {});
    invalidateTaskQueryCache();
    await load(filters, true);
  }

  function requestDelete(task: AnyRecord, event?: { stopPropagation: () => void }) {
    event?.stopPropagation();
    setDeleteTarget(task);
  }

  async function deleteSelectedTask() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/tasks/${deleteTarget.id}`);
      if (editingTask?.id === deleteTarget.id) closeDrawer();
      if (viewingTask?.id === deleteTarget.id) closeTaskDetails();
      setDeleteTarget(null);
      invalidateTaskQueryCache();
      await load(filters, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setDeleting(false);
    }
  }

  async function resetFilters() {
    const nextFilters = defaultTaskFilters;
    setFilters(nextFilters);
    setQuery("");
    await load(nextFilters, true);
  }

  const filteredTasks = useMemo(
    () => sortByPriority(tasks.filter((task) => matchesQuery(task, query, ["title", "description", "assignee"]))),
    [query, tasks]
  );

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6 pb-10">
      <header className="hidden items-center justify-between gap-6 border-b border-border pb-4 md:flex">
        <h1
          className="min-w-0 text-pretty text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
          dir="auto"
        >
          {t("tasks.title")}
        </h1>

        <div className="flex min-w-0 items-center gap-3" dir="ltr">
          <Button dir={direction} size="sm" type="button" onClick={openCreate}>
            <Plus data-icon="inline-start" />
            {t("tasks.newTask")}
          </Button>
          <Button
            variant={showFilters ? "secondary" : "ghost"}
            size="icon-sm"
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            aria-label={t("tasks.filters")}
            aria-expanded={showFilters}
            className={cn(
              "rounded-lg text-muted-foreground hover:text-foreground",
              showFilters && "text-primary"
            )}
          >
            <Filter className="size-[18px]" aria-hidden />
          </Button>
          <div className="relative w-72 min-w-0">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              dir={direction}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`${t("tasks.searchPlaceholder")}...`}
              className={cn(
                "h-9 rounded-lg border-border bg-secondary/70 pl-10 pr-3 text-sm shadow-none focus-visible:ring-1",
                direction === "rtl" ? "text-right" : "text-left"
              )}
            />
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 md:hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex h-[58px] shrink-0 items-center justify-start">
              <Button size="sm" type="button" onClick={openCreate}>
                <Plus data-icon="inline-start" />
                {t("tasks.newTask")}
              </Button>
            </div>

            <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
              <div className="p-2">
                <div className="relative flex items-center">
                  <Search
                    className="pointer-events-none absolute start-3 size-[18px] text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    dir="auto"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={`${t("tasks.searchPlaceholder")}...`}
                    className="h-10 min-w-0 flex-1 border-0 bg-transparent pe-12 ps-10 text-sm shadow-none focus-visible:ring-0"
                  />
                  <Button
                    variant={showFilters ? "secondary" : "ghost"}
                    size="icon-sm"
                    type="button"
                    onClick={() => setShowFilters((current) => !current)}
                    aria-label={t("tasks.filters")}
                    aria-expanded={showFilters}
                    className={cn(
                      "ms-1 rounded-lg text-muted-foreground hover:text-foreground",
                      showFilters && "text-primary"
                    )}
                  >
                    <Filter className="size-[18px]" aria-hidden />
                  </Button>
                </div>
              </div>

              {showFilters ? (
                <div className="border-t border-border bg-muted/20 p-4">
                  <TaskFilterPanel
                    filters={filters}
                    projects={projects}
                    onFiltersChange={setFilters}
                    onReset={resetFilters}
                    onApply={() => load()}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {showFilters ? (
          <div className="hidden rounded-xl border border-border bg-card p-4 shadow-xs md:block">
            <TaskFilterPanel
              filters={filters}
              projects={projects}
              onFiltersChange={setFilters}
              onReset={resetFilters}
              onApply={() => load()}
            />
          </div>
        ) : null}

        {!filteredTasks.length ? (
          <EmptyState title={t("tasks.empty")}>{t("common.emptySearch")}</EmptyState>
        ) : (
          <>
            <div className="md:hidden">
              <TaskCards
                tasks={filteredTasks}
                projects={projects}
                formatDate={formatDate}
                onOpenDetails={openTaskDetails}
                onComplete={complete}
                onDelete={requestDelete}
              />
            </div>
            <TaskDesktopList
              tasks={filteredTasks}
              projects={projects}
              formatDate={formatDate}
              onOpenDetails={openTaskDetails}
              onComplete={complete}
              onDelete={requestDelete}
            />
          </>
        )}
      </section>

      <TaskEditorDrawer
        open={drawerOpen}
        task={editingTask}
        projects={projects}
        defaultProjectId={filters.project_id}
        defaultPriority={filters.priority || "medium"}
        defaultStatus={filters.status || "todo"}
        onClose={closeDrawer}
        onSave={save}
        onDelete={requestDelete}
      />

      <TaskDetailDialog
        open={Boolean(viewingTask)}
        task={viewingTask}
        projects={projects}
        onClose={closeTaskDetails}
        onEdit={openEdit}
        onComplete={complete}
        onDelete={(task) => {
          closeTaskDetails();
          requestDelete(task);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("tasks.deleteTask")}
        description={t("tasks.deleteConfirm", {
          title: String(deleteTarget?.title || t("entity.task"))
        })}
        confirmLabel={deleting ? t("common.deleting") : t("common.delete")}
        destructive
        loading={deleting}
        onConfirm={() => void deleteSelectedTask()}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function TaskFilterPanel({
  filters,
  projects,
  onFiltersChange,
  onReset,
  onApply
}: {
  filters: TaskFilters;
  projects: AnyRecord[];
  onFiltersChange: (filters: TaskFilters) => void;
  onReset: () => void | Promise<void>;
  onApply: () => void | Promise<void>;
}) {
  const { t, translateValue } = useI18n();

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center">
      <Select
        value={filters.status || ANY}
        onValueChange={(value) => onFiltersChange({ ...filters, status: value === ANY ? "" : value })}
      >
        <SelectTrigger className="w-full min-w-0 rounded-xl bg-background/70">
          <SelectValue placeholder={t("tasks.anyStatus")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("tasks.anyStatus")}</SelectItem>
          {statuses.map((status) => (
            <SelectItem key={status} value={status}>
              {translateValue("status", status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.priority || ANY}
        onValueChange={(value) => onFiltersChange({ ...filters, priority: value === ANY ? "" : value })}
      >
        <SelectTrigger className="w-full min-w-0 rounded-xl bg-background/70">
          <SelectValue placeholder={t("tasks.anyPriority")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("tasks.anyPriority")}</SelectItem>
          {priorities.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {translateValue("priority", priority)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.project_id || ANY}
        onValueChange={(value) => onFiltersChange({ ...filters, project_id: value === ANY ? "" : value })}
      >
        <SelectTrigger className="w-full min-w-0 rounded-xl bg-background/70">
          <SelectValue placeholder={t("tasks.anyProject")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("tasks.anyProject")}</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={String(project.id)}>
              <span className="inline-flex min-w-0 items-center gap-2">
                {projectColorValue(project.color) ? (
                  <span
                    className={cn("size-2.5 shrink-0 rounded-full", projectColorClass(project.color, "swatch"))}
                    style={projectColorStyle(project.color)}
                    aria-hidden
                  />
                ) : null}
                <span className="truncate">{project.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="grid grid-cols-2 gap-3 md:flex md:justify-end">
        <Button variant="ghost" size="sm" type="button" onClick={() => void onReset()} className="rounded-xl">
          {t("common.reset")}
        </Button>
        <Button variant="outline" size="sm" type="button" onClick={() => void onApply()} className="rounded-xl">
          {t("common.apply")}
        </Button>
      </div>
    </div>
  );
}

function TaskDesktopList({
  tasks,
  projects,
  formatDate,
  onOpenDetails,
  onComplete,
  onDelete
}: {
  tasks: AnyRecord[];
  projects: AnyRecord[];
  formatDate: (value?: string | null) => string;
  onOpenDetails: (task: AnyRecord) => void;
  onComplete: (id: string) => void;
  onDelete: (task: AnyRecord, event?: { stopPropagation: () => void }) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="hidden overflow-x-auto overflow-y-hidden rounded-xl border border-border bg-card shadow-xs md:block" role="table">
      <div
        className="grid min-w-[58rem] grid-cols-[64px_112px_112px_170px_150px_minmax(220px,1fr)] items-center border-b border-border bg-background/30 px-6 py-3 text-xs font-semibold text-muted-foreground"
        dir="ltr"
        role="row"
      >
        <div className="text-center" dir="rtl" role="columnheader">
          {t("command.actions")}
        </div>
        <div className="text-center" dir="rtl" role="columnheader">
          {t("common.status")}
        </div>
        <div className="text-center" dir="rtl" role="columnheader">
          {t("common.priority")}
        </div>
        <div className="text-center" dir="rtl" role="columnheader">
          {t("common.due")}
        </div>
        <div className="text-center" dir="rtl" role="columnheader">
          {t("common.project")}
        </div>
        <div className="text-right" dir="rtl" role="columnheader">
          {t("entity.task")}
        </div>
      </div>

      {tasks.map((task) => {
        const isDone = task.status === "done";
        const description = truncate(task.description, 120);
        const linkedProject = findProjectForRecord(projects, task);
        const project = linkedProject?.name ?? projectName(projects, String(task.projectId ?? task.project_id ?? ""));
        const displayDate =
          dateValue(task, "dueAt") ??
          dateValue(task, "scheduledFor") ??
          dateValue(task, "completedAt") ??
          dateValue(task, "updatedAt");

        return (
          <div
            key={task.id}
            tabIndex={0}
            aria-label={`${t("common.open")}: ${String(task.title ?? t("entity.task"))}`}
            className={cn(
              "grid min-w-[58rem] cursor-pointer grid-cols-[64px_112px_112px_170px_150px_minmax(220px,1fr)] items-center border-b border-border/80 px-6 py-4 transition-colors last:border-b-0 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              projectColorClass(linkedProject?.color, "row"),
              isDone && "opacity-75"
            )}
            style={projectColorStyle(linkedProject?.color)}
            dir="ltr"
            role="row"
            onClick={() => onOpenDetails(task)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenDetails(task);
              }
            }}
          >
            <div className="flex items-center justify-center" dir="ltr" role="cell">
              <Button
                variant="delete"
                size="icon-sm"
                type="button"
                onClick={(event) => onDelete(task, event)}
                title={t("common.delete")}
                aria-label={t("common.delete")}
              >
                <Trash2 className="size-[18px]" aria-hidden />
              </Button>
            </div>

            <div className="flex justify-center" dir="rtl" role="cell">
              <TaskStatusBadge value={task.status} />
            </div>

            <div className="flex justify-center" dir="rtl" role="cell">
              <TaskPriorityBadge value={task.priority} />
            </div>

            <div className="truncate text-center text-sm text-foreground" dir="ltr" role="cell">
              {formatDate(displayDate)}
            </div>

            <div className="flex justify-center" dir="rtl" role="cell">
              <Badge
                variant="secondary"
                className={cn(
                  "max-w-full rounded-md bg-secondary/80 px-2 py-1 text-xs font-medium text-secondary-foreground",
                  projectColorClass(linkedProject?.color, "badge")
                )}
                style={projectColorStyle(linkedProject?.color)}
              >
                <span className="truncate" dir="auto">
                  {project || t("common.noProject")}
                </span>
              </Badge>
            </div>

            <div className="flex min-w-0 items-start gap-3" dir="rtl" role="cell">
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isDone) void onComplete(task.id);
                }}
                aria-disabled={isDone}
                title={isDone ? t("tasks.completed") : t("tasks.markDone")}
                aria-label={isDone ? t("tasks.completed") : t("tasks.markDone")}
                className={cn(
                  "mt-0.5 shrink-0 rounded-full text-muted-foreground hover:bg-success/10 hover:text-success",
                  isDone && "text-success hover:bg-success/10 hover:text-success"
                )}
              >
                <CheckCircle2 className={cn("size-5", isDone && "fill-success/20")} aria-hidden />
              </Button>
              <div className="min-w-0 flex-1 text-right">
                <h3
                  className={cn(
                    "truncate text-sm font-semibold leading-6 text-foreground",
                    isDone && "text-muted-foreground line-through"
                  )}
                  dir="auto"
                >
                  {task.title}
                </h3>
                {description ? (
                  <p className="line-clamp-2 text-xs leading-5 text-muted-foreground" dir="auto">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCards({
  tasks,
  projects,
  formatDate,
  onOpenDetails,
  onComplete,
  onDelete
}: {
  tasks: AnyRecord[];
  projects: AnyRecord[];
  formatDate: (value?: string | null) => string;
  onOpenDetails: (task: AnyRecord) => void;
  onComplete: (id: string) => void;
  onDelete: (task: AnyRecord, event?: { stopPropagation: () => void }) => void;
}) {
  return (
    <div className="grid min-w-0 max-w-full gap-4 xl:grid-cols-2">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          projects={projects}
          formatDate={formatDate}
          onOpenDetails={onOpenDetails}
          onComplete={onComplete}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function TaskCard({
  task,
  projects,
  formatDate,
  onOpenDetails,
  onComplete,
  onDelete
}: {
  task: AnyRecord;
  projects: AnyRecord[];
  formatDate: (value?: string | null) => string;
  onOpenDetails: (task: AnyRecord) => void;
  onComplete: (id: string) => void;
  onDelete: (task: AnyRecord, event?: { stopPropagation: () => void }) => void;
}) {
  const { t } = useI18n();
  const isDone = task.status === "done";
  const description = truncate(task.description, 140);
  const assignee = String(task.assignee ?? "").trim();
  const linkedProject = findProjectForRecord(projects, task);
  const project = linkedProject?.name ?? projectName(projects, String(task.projectId ?? task.project_id ?? ""));
  const displayDate =
    dateValue(task, "dueAt") ??
    dateValue(task, "scheduledFor") ??
    dateValue(task, "completedAt") ??
    dateValue(task, "updatedAt");

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`${t("common.open")}: ${String(task.title ?? t("entity.task"))}`}
      onClick={() => onOpenDetails(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails(task);
        }
      }}
      className={cn(
        "flex min-w-0 max-w-full cursor-pointer flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        projectColorClass(linkedProject?.color, "card")
      )}
      style={projectColorStyle(linkedProject?.color)}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-[15px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere]" dir="auto">
          {task.title}
        </h3>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <TaskStatusBadge value={task.status} />
          <TaskPriorityBadge value={task.priority} />
        </div>
      </div>

      <div className="flex min-h-[5.5rem] min-w-0 max-w-full flex-col gap-1.5 overflow-hidden rounded-xl border border-border bg-background/50 p-3">
        {assignee ? <TaskMetaRow label={t("tasks.assignee")} value={assignee} /> : null}
        <TaskMetaRow label={t("common.project")} value={project || t("common.noProject")} />
        {description ? <TaskMetaRow label={t("common.description")} value={description} /> : null}
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{formatDate(displayDate)}</span>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
        <div className="flex items-center gap-1">
          <Button
            variant="delete"
            size="icon-sm"
            type="button"
            onClick={(event) => onDelete(task, event)}
            title={t("common.delete")}
            aria-label={t("common.delete")}
          >
            <Trash2 className="size-[18px]" aria-hidden />
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (!isDone) void onComplete(task.id);
          }}
          aria-disabled={isDone}
          className={cn(
            "rounded-lg px-3 text-sm font-semibold",
            isDone
              ? "bg-success/10 text-success hover:bg-success/15 hover:text-success"
              : "border border-border bg-secondary/60 text-secondary-foreground hover:bg-secondary"
          )}
        >
          <CheckCircle2 className={cn("size-4", isDone && "fill-success/20")} aria-hidden />
          {isDone ? t("tasks.completed") : t("tasks.markDone")}
        </Button>
      </div>
    </article>
  );
}

function TaskMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 max-w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-2 text-xs text-muted-foreground">
      <span className="min-w-0 max-w-24 truncate font-medium text-muted-foreground/80">{label}:</span>
      <span className="min-w-0 truncate text-start" dir="auto">
        {value}
      </span>
    </div>
  );
}

function TaskPriorityBadge({ value }: { value?: string | null }) {
  const { translateValue } = useI18n();
  const priority = value ?? "medium";

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md border-transparent px-2 py-1",
        priority === "urgent" && "bg-destructive/15 text-destructive",
        priority === "high" && "bg-warning/15 text-warning",
        priority === "medium" && "bg-info/12 text-info",
        priority === "low" && "bg-muted text-muted-foreground"
      )}
    >
      {translateValue("priority", priority)}
    </Badge>
  );
}

function TaskStatusBadge({ value }: { value?: string | null }) {
  const { translateValue } = useI18n();
  const status = value ?? "todo";

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md border-transparent px-2 py-1",
        status === "done" && "bg-success/12 text-success",
        status === "waiting" && "bg-warning/15 text-warning",
        status === "cancelled" && "bg-destructive/15 text-destructive",
        status !== "done" && status !== "waiting" && status !== "cancelled" && "bg-secondary text-secondary-foreground"
      )}
    >
      {translateValue("status", status)}
    </Badge>
  );
}
