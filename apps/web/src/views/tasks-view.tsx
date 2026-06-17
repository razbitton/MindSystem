"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Columns3, Edit3, List, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { apiDelete, apiPatch, apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateWorkspaceQueryCache,
  peekCachedQuery
} from "../lib/query-cache";
import {
  dateValue,
  fromDateTimeInput,
  loadPreference,
  matchesQuery,
  projectName,
  savePreference,
  toDateTimeInput,
  truncate,
  type TaskViewMode
} from "../lib/view-models";
import {
  Drawer,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  PriorityBadge,
  SegmentedControl,
  StatusBadge
} from "../components/page";
import { ConfirmDialog } from "../components/confirm-dialog";
import { useI18n } from "../i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";

const statuses = ["inbox", "todo", "in_progress", "waiting", "done", "cancelled"] as const;
const boardStatuses = ["inbox", "todo", "in_progress", "waiting", "done"] as const;
const priorities = ["low", "medium", "high", "urgent"] as const;
const preferenceKey = "mindsystem.tasks.view";
const taskViewModes = ["board", "list"] as const;
const ANY = "__any__";
const NO_PROJECT = "__none__";
const defaultTaskFilters = { status: "", project_id: "", priority: "" };

type TaskForm = {
  title: string;
  description: string;
  projectId: string;
  status: string;
  priority: string;
  dueAt: string;
  scheduledFor: string;
  estimateMinutes: string;
  assignee: string;
};

export default function TasksView() {
  const { t, formatDate, translateValue } = useI18n();
  const [tasks, setTasks] = useState<AnyRecord[]>(
    () => peekCachedQuery<{ tasks: AnyRecord[] }>("/api/tasks", defaultTaskFilters)?.tasks ?? []
  );
  const [projects, setProjects] = useState<AnyRecord[]>(
    () => peekCachedQuery<{ projects: AnyRecord[] }>("/api/projects")?.projects ?? []
  );
  const [filters, setFilters] = useState(defaultTaskFilters);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TaskViewMode>("board");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AnyRecord | null>(null);
  const [form, setForm] = useState<TaskForm>(blankForm());
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

  useEffect(() => {
    setView(loadPreference(preferenceKey, "board", taskViewModes));
    void load();
  }, []);

  function changeView(nextView: TaskViewMode) {
    setView(nextView);
    savePreference(preferenceKey, nextView);
  }

  function openCreate() {
    setEditingTask(null);
    setForm({ ...blankForm(), projectId: filters.project_id, priority: filters.priority || "medium", status: filters.status || "todo" });
    setDrawerOpen(true);
  }

  function openEdit(task: AnyRecord) {
    setEditingTask(task);
    setForm({
      title: String(task.title ?? ""),
      description: String(task.description ?? ""),
      projectId: String(task.projectId ?? task.project_id ?? ""),
      status: String(task.status ?? "todo"),
      priority: String(task.priority ?? "medium"),
      dueAt: toDateTimeInput(dateValue(task, "dueAt")),
      scheduledFor: toDateTimeInput(dateValue(task, "scheduledFor")),
      estimateMinutes: task.estimateMinutes ?? task.estimate_minutes ? String(task.estimateMinutes ?? task.estimate_minutes) : "",
      assignee: String(task.assignee ?? "")
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingTask(null);
    setForm(blankForm());
  }

  async function save() {
    if (!form.title.trim()) return;
    const payload = {
      title: form.title,
      description: form.description || undefined,
      projectId: form.projectId || null,
      status: form.status,
      priority: form.priority,
      dueAt: fromDateTimeInput(form.dueAt),
      scheduledFor: fromDateTimeInput(form.scheduledFor),
      estimateMinutes: form.estimateMinutes.trim() ? Number(form.estimateMinutes) : null,
      assignee: form.assignee.trim() || null
    };
    if (editingTask) {
      await apiPatch(`/api/tasks/${editingTask.id}`, payload);
    } else {
      await apiPost("/api/tasks", payload);
    }
    closeDrawer();
    invalidateWorkspaceQueryCache();
    await load(filters, true);
  }

  async function complete(id: string) {
    await apiPost(`/api/tasks/${id}/complete`, {});
    invalidateWorkspaceQueryCache();
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
      setDeleteTarget(null);
      invalidateWorkspaceQueryCache();
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
    () => tasks.filter((task) => matchesQuery(task, query, ["title", "description", "assignee"])),
    [query, tasks]
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("tasks.title")}
        subtitle={t("tasks.subtitle")}
        actions={
          <>
            <Button variant="outline" size="sm" type="button" onClick={() => load(filters, true)}>
              <RefreshCw data-icon="inline-start" />
              {t("common.refresh")}
            </Button>
            <Button size="sm" type="button" onClick={openCreate}>
              <Plus data-icon="inline-start" />
              {t("tasks.newTask")}
            </Button>
          </>
        }
      />

      <Panel>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
                aria-hidden
              />
              <Input
                dir="auto"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("tasks.searchPlaceholder")}
                className="ps-9"
              />
            </div>
            <Select
              value={filters.status || ANY}
              onValueChange={(value) => setFilters({ ...filters, status: value === ANY ? "" : value })}
            >
              <SelectTrigger className="w-40">
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
              onValueChange={(value) => setFilters({ ...filters, priority: value === ANY ? "" : value })}
            >
              <SelectTrigger className="w-40">
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
              onValueChange={(value) => setFilters({ ...filters, project_id: value === ANY ? "" : value })}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t("tasks.anyProject")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t("tasks.anyProject")}</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" type="button" onClick={() => load()}>
              {t("common.apply")}
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={resetFilters}>
              {t("common.reset")}
            </Button>
            <SegmentedControl
              label={t("common.view")}
              value={view}
              onChange={changeView}
              options={[
                { value: "board", label: t("common.board"), icon: <Columns3 size={15} aria-hidden /> },
                { value: "list", label: t("common.list"), icon: <List size={15} aria-hidden /> }
              ]}
            />
          </div>

          {!filteredTasks.length ? (
            <EmptyState title={t("tasks.empty")}>{t("common.emptySearch")}</EmptyState>
          ) : view === "board" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {boardStatuses.map((status) => {
                const columnTasks = filteredTasks.filter((task) => task.status === status);
                return (
                  <section
                    key={status}
                    className="flex min-h-60 flex-col gap-2 overflow-hidden rounded-xl bg-muted/40 p-2.5 [max-block-size:min(48rem,calc(100svh_-_10rem))]"
                  >
                    <div className="flex shrink-0 items-center justify-between gap-2 px-1">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {translateValue("status", status)}
                      </h2>
                      <Badge variant="secondary">{columnTasks.length}</Badge>
                    </div>
                    <div className="bounded-scroll flex flex-col gap-2">
                      {columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          projects={projects}
                          formatDate={formatDate}
                          onEdit={openEdit}
                          onComplete={complete}
                          onDelete={requestDelete}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <ul className="bounded-scroll flex flex-col divide-y divide-border rounded-xl border border-border [max-block-size:min(54rem,calc(100svh_-_10rem))]">
              {filteredTasks.map((task) => (
                <li key={task.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm font-medium text-foreground" dir="auto">
                      {task.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" dir="auto">
                      {truncate(task.description, 140)} · {formatDate(dateValue(task, "dueAt") ?? dateValue(task, "scheduledFor"))}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PriorityBadge value={task.priority} />
                    <StatusBadge value={task.status} />
                    <IconButton label={t("common.edit")} onClick={() => openEdit(task)}>
                      <Edit3 className="size-4" aria-hidden />
                    </IconButton>
                    <IconButton
                      label={t("common.delete")}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => requestDelete(task)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </IconButton>
                    {task.status !== "done" ? (
                      <IconButton label={t("common.complete")} onClick={() => complete(task.id)}>
                        <CheckCircle className="size-4" aria-hidden />
                      </IconButton>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Drawer
        open={drawerOpen}
        title={editingTask ? t("tasks.editTask") : t("tasks.newTask")}
        subtitle={editingTask ? formatDate(dateValue(editingTask, "updatedAt")) : t("tasks.subtitle")}
        onClose={closeDrawer}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {editingTask ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => requestDelete(editingTask)}
                >
                  <Trash2 data-icon="inline-start" />
                  {t("common.delete")}
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" type="button" onClick={closeDrawer}>
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={save} disabled={!form.title.trim()}>
                {t("common.save")}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-title">{t("common.title")}</Label>
            <Input
              id="task-title"
              dir="auto"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-description">{t("common.description")}</Label>
            <Textarea
              id="task-description"
              dir="auto"
              rows={4}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-project">{t("common.project")}</Label>
              <Select
                value={form.projectId || NO_PROJECT}
                onValueChange={(value) => setForm({ ...form, projectId: value === NO_PROJECT ? "" : value })}
              >
                <SelectTrigger id="task-project" className="w-full">
                  <SelectValue placeholder={t("common.noProject")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>{t("common.noProject")}</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-status">{t("common.status")}</Label>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                <SelectTrigger id="task-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {translateValue("status", status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-priority">{t("common.priority")}</Label>
              <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}>
                <SelectTrigger id="task-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {translateValue("priority", priority)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-assignee">{t("tasks.assignee")}</Label>
              <Input
                id="task-assignee"
                dir="auto"
                value={form.assignee}
                onChange={(event) => setForm({ ...form, assignee: event.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-due">{t("tasks.dueAt")}</Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={form.dueAt}
                onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-scheduled">{t("tasks.scheduledFor")}</Label>
              <Input
                id="task-scheduled"
                type="datetime-local"
                value={form.scheduledFor}
                onChange={(event) => setForm({ ...form, scheduledFor: event.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-estimate">{t("tasks.estimateMinutes")}</Label>
            <Input
              id="task-estimate"
              type="number"
              min="1"
              value={form.estimateMinutes}
              onChange={(event) => setForm({ ...form, estimateMinutes: event.target.value })}
            />
          </div>
        </div>
      </Drawer>

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

function TaskCard({
  task,
  projects,
  formatDate,
  onEdit,
  onComplete,
  onDelete
}: {
  task: AnyRecord;
  projects: AnyRecord[];
  formatDate: (value?: string | null) => string;
  onEdit: (task: AnyRecord) => void;
  onComplete: (id: string) => void;
  onDelete: (task: AnyRecord, event?: { stopPropagation: () => void }) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-52 shrink-0 flex-col gap-2 overflow-auto overscroll-contain rounded-lg border border-border bg-card p-3 shadow-xs transition-shadow hover:shadow-md [max-block-size:min(18rem,calc(100svh_-_18rem))]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground" dir="auto">
            {task.title}
          </p>
          <p className="line-clamp-2 text-xs text-muted-foreground" dir="auto">
            {truncate(task.description, 120) || t("common.noDescription")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label={t("common.edit")} onClick={() => onEdit(task)}>
            <Edit3 className="size-[15px]" aria-hidden />
          </IconButton>
          <IconButton
            label={t("common.delete")}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={(event) => onDelete(task, event)}
          >
            <Trash2 className="size-[15px]" aria-hidden />
          </IconButton>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <PriorityBadge value={task.priority} />
        <span>{formatDate(dateValue(task, "dueAt") ?? dateValue(task, "scheduledFor"))}</span>
        <span>{projectName(projects, String(task.projectId ?? task.project_id ?? "")) || t("common.noProject")}</span>
      </div>
      {task.status !== "done" ? (
        <Button variant="ghost" size="sm" className="justify-start" type="button" onClick={() => onComplete(task.id)}>
          <CheckCircle data-icon="inline-start" />
          {t("common.complete")}
        </Button>
      ) : null}
    </div>
  );
}

function blankForm(): TaskForm {
  return {
    title: "",
    description: "",
    projectId: "",
    status: "todo",
    priority: "medium",
    dueAt: "",
    scheduledFor: "",
    estimateMinutes: "",
    assignee: ""
  };
}
