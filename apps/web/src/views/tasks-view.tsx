"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Columns3, Edit3, List, Plus, RefreshCw, Search } from "lucide-react";
import { apiGet, apiPatch, apiPost, type AnyRecord } from "../lib/api";
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
import { Drawer, EmptyState, IconButton, PageHeader, Panel, PriorityBadge, SegmentedControl, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";

const statuses = ["inbox", "todo", "in_progress", "waiting", "done", "cancelled"] as const;
const boardStatuses = ["inbox", "todo", "in_progress", "waiting", "done"] as const;
const priorities = ["low", "medium", "high", "urgent"] as const;
const preferenceKey = "mindsystem.tasks.view";
const taskViewModes = ["board", "list"] as const;

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
  const [tasks, setTasks] = useState<AnyRecord[]>([]);
  const [projects, setProjects] = useState<AnyRecord[]>([]);
  const [filters, setFilters] = useState({ status: "", project_id: "", priority: "" });
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TaskViewMode>("board");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AnyRecord | null>(null);
  const [form, setForm] = useState<TaskForm>(blankForm());

  async function load(nextFilters = filters) {
    const [taskData, projectData] = await Promise.all([
      apiGet<{ tasks: AnyRecord[] }>("/api/tasks", nextFilters),
      apiGet<{ projects: AnyRecord[] }>("/api/projects")
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
    await load();
  }

  async function complete(id: string) {
    await apiPost(`/api/tasks/${id}/complete`, {});
    await load();
  }

  async function resetFilters() {
    const nextFilters = { status: "", project_id: "", priority: "" };
    setFilters(nextFilters);
    setQuery("");
    await load(nextFilters);
  }

  const filteredTasks = useMemo(() => tasks.filter((task) => matchesQuery(task, query, ["title", "description", "assignee"])), [query, tasks]);

  return (
    <>
      <PageHeader
        title={t("tasks.title")}
        subtitle={t("tasks.subtitle")}
        actions={
          <>
            <button className="button" type="button" onClick={() => load()}>
              <RefreshCw size={16} aria-hidden /> {t("common.refresh")}
            </button>
            <button className="button primary" type="button" onClick={openCreate}>
              <Plus size={16} aria-hidden /> {t("tasks.newTask")}
            </button>
          </>
        }
      />

      <Panel>
        <div className="filter-bar">
          <div className="shell-search" style={{ flex: "1 1 260px" }}>
            <Search size={16} aria-hidden />
            <input dir="auto" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("tasks.searchPlaceholder")} />
          </div>
          <select className="select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} style={{ maxWidth: 190 }}>
            <option value="">{t("tasks.anyStatus")}</option>
            {statuses.map((status) => (
              <option key={status} value={status}>{translateValue("status", status)}</option>
            ))}
          </select>
          <select className="select" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })} style={{ maxWidth: 190 }}>
            <option value="">{t("tasks.anyPriority")}</option>
            {priorities.map((priority) => (
              <option key={priority} value={priority}>{translateValue("priority", priority)}</option>
            ))}
          </select>
          <select className="select" value={filters.project_id} onChange={(event) => setFilters({ ...filters, project_id: event.target.value })} style={{ maxWidth: 230 }}>
            <option value="">{t("tasks.anyProject")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <button className="button" type="button" onClick={() => load()}>{t("common.apply")}</button>
          <button className="button subtle" type="button" onClick={resetFilters}>{t("common.reset")}</button>
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

        {!filteredTasks.length ? <EmptyState title={t("tasks.empty")}>{t("common.emptySearch")}</EmptyState> : null}

        {view === "board" ? (
          <div className="board-grid">
            {boardStatuses.map((status) => {
              const columnTasks = filteredTasks.filter((task) => task.status === status);
              return (
                <section className="board-column" key={status}>
                  <div className="board-column-header">
                    <h2 className="board-column-title">{translateValue("status", status)}</h2>
                    <span className="badge neutral">{columnTasks.length}</span>
                  </div>
                  {columnTasks.map((task) => (
                    <TaskCard key={task.id} task={task} projects={projects} formatDate={formatDate} onEdit={openEdit} onComplete={complete} />
                  ))}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="list-surface">
            {filteredTasks.map((task) => (
              <div className="row-item" key={task.id}>
                <div>
                  <p className="row-title" dir="auto">{task.title}</p>
                  <p className="row-meta" dir="auto">{truncate(task.description, 180)} - {formatDate(dateValue(task, "dueAt") ?? dateValue(task, "scheduledFor"))}</p>
                </div>
                <div className="toolbar">
                  <PriorityBadge value={task.priority} />
                  <StatusBadge value={task.status} />
                  <IconButton label={t("common.edit")} onClick={() => openEdit(task)}>
                    <Edit3 size={16} aria-hidden />
                  </IconButton>
                  {task.status !== "done" ? (
                    <IconButton label={t("common.complete")} onClick={() => complete(task.id)}>
                      <CheckCircle size={16} aria-hidden />
                    </IconButton>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Drawer
        open={drawerOpen}
        title={editingTask ? t("tasks.editTask") : t("tasks.newTask")}
        subtitle={editingTask ? formatDate(dateValue(editingTask, "updatedAt")) : t("tasks.subtitle")}
        onClose={closeDrawer}
        footer={
          <>
            <button className="button" type="button" onClick={closeDrawer}>{t("common.cancel")}</button>
            <button className="button primary" type="button" onClick={save} disabled={!form.title.trim()}>{t("common.save")}</button>
          </>
        }
      >
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="task-title">{t("common.title")}</label>
            <input id="task-title" className="input" dir="auto" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </div>
          <div className="form-row">
            <label htmlFor="task-description">{t("common.description")}</label>
            <textarea id="task-description" className="textarea" dir="auto" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>
          <div className="grid two">
            <div className="form-row">
              <label htmlFor="task-project">{t("common.project")}</label>
              <select id="task-project" className="select" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
                <option value="">{t("common.noProject")}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="task-status">{t("common.status")}</label>
              <select id="task-status" className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                {statuses.map((status) => (
                  <option key={status} value={status}>{translateValue("status", status)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid two">
            <div className="form-row">
              <label htmlFor="task-priority">{t("common.priority")}</label>
              <select id="task-priority" className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>{translateValue("priority", priority)}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="task-assignee">{t("tasks.assignee")}</label>
              <input id="task-assignee" className="input" dir="auto" value={form.assignee} onChange={(event) => setForm({ ...form, assignee: event.target.value })} />
            </div>
          </div>
          <div className="grid two">
            <div className="form-row">
              <label htmlFor="task-due">{t("tasks.dueAt")}</label>
              <input id="task-due" className="input" type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} />
            </div>
            <div className="form-row">
              <label htmlFor="task-scheduled">{t("tasks.scheduledFor")}</label>
              <input id="task-scheduled" className="input" type="datetime-local" value={form.scheduledFor} onChange={(event) => setForm({ ...form, scheduledFor: event.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="task-estimate">{t("tasks.estimateMinutes")}</label>
            <input id="task-estimate" className="input" type="number" min="1" value={form.estimateMinutes} onChange={(event) => setForm({ ...form, estimateMinutes: event.target.value })} />
          </div>
        </div>
      </Drawer>
    </>
  );
}

function TaskCard({
  task,
  projects,
  formatDate,
  onEdit,
  onComplete
}: {
  task: AnyRecord;
  projects: AnyRecord[];
  formatDate: (value?: string | null) => string;
  onEdit: (task: AnyRecord) => void;
  onComplete: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="item-card">
      <div className="item-card-header">
        <div>
          <p className="item-card-title" dir="auto">{task.title}</p>
          <p className="item-card-body" dir="auto">{truncate(task.description, 120) || t("common.noDescription")}</p>
        </div>
        <IconButton label={t("common.edit")} onClick={() => onEdit(task)}>
          <Edit3 size={15} aria-hidden />
        </IconButton>
      </div>
      <div className="item-card-meta">
        <PriorityBadge value={task.priority} />
        <span>{formatDate(dateValue(task, "dueAt") ?? dateValue(task, "scheduledFor"))}</span>
        <span>{projectName(projects, String(task.projectId ?? task.project_id ?? "")) || t("common.noProject")}</span>
      </div>
      {task.status !== "done" ? (
        <button className="button subtle" type="button" onClick={() => onComplete(task.id)}>
          <CheckCircle size={15} aria-hidden /> {t("common.complete")}
        </button>
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
