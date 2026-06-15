"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Plus, RefreshCw } from "lucide-react";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel, PriorityBadge, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";

const statuses = ["inbox", "todo", "in_progress", "waiting", "done", "cancelled"] as const;
const priorities = ["low", "medium", "high", "urgent"] as const;

export default function TasksView() {
  const { t, formatDate, translateValue } = useI18n();
  const [tasks, setTasks] = useState<AnyRecord[]>([]);
  const [projects, setProjects] = useState<AnyRecord[]>([]);
  const [filters, setFilters] = useState({ status: "", project_id: "", priority: "" });
  const [form, setForm] = useState({ title: "", description: "", projectId: "", priority: "medium" });

  async function load() {
    const [taskData, projectData] = await Promise.all([
      apiGet<{ tasks: AnyRecord[] }>("/api/tasks", filters),
      apiGet<{ projects: AnyRecord[] }>("/api/projects")
    ]);
    setTasks(taskData.tasks);
    setProjects(projectData.projects);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    if (!form.title.trim()) return;
    await apiPost("/api/tasks", { ...form, projectId: form.projectId || null });
    setForm({ title: "", description: "", projectId: "", priority: "medium" });
    await load();
  }

  async function complete(id: string) {
    await apiPost(`/api/tasks/${id}/complete`, {});
    await load();
  }

  return (
    <>
      <PageHeader title={t("tasks.title")} subtitle={t("tasks.subtitle")} actions={<button className="button" onClick={load}><RefreshCw size={16} /> {t("common.refresh")}</button>} />
      <div className="grid two">
        <Panel title={t("tasks.createPanel")}>
          <div className="form-grid">
            <input className="input" dir="auto" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t("tasks.titlePlaceholder")} />
            <textarea className="textarea" dir="auto" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={t("common.description")} />
            <select className="select" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
              <option value="">{t("common.noProject")}</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <select className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              {priorities.map((priority) => <option key={priority} value={priority}>{translateValue("priority", priority)}</option>)}
            </select>
            <button className="button primary" onClick={create}><Plus size={16} /> {t("common.create")}</button>
          </div>
        </Panel>
        <Panel title={t("tasks.filters")}>
          <div className="form-grid">
            <select className="select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">{t("tasks.anyStatus")}</option>
              {statuses.map((status) => <option key={status} value={status}>{translateValue("status", status)}</option>)}
            </select>
            <select className="select" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>
              <option value="">{t("tasks.anyPriority")}</option>
              {priorities.map((priority) => <option key={priority} value={priority}>{translateValue("priority", priority)}</option>)}
            </select>
            <select className="select" value={filters.project_id} onChange={(event) => setFilters({ ...filters, project_id: event.target.value })}>
              <option value="">{t("tasks.anyProject")}</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button className="button" onClick={load}>{t("common.apply")}</button>
          </div>
        </Panel>
      </div>
      <div style={{ marginTop: 14 }}>
        <Panel title={t("tasks.list")}>
          {!tasks.length ? <EmptyState>{t("tasks.empty")}</EmptyState> : null}
          <div className="row-list">
            {tasks.map((task) => (
              <div className="row-item" key={task.id}>
                <div>
                  <p className="row-title" dir="auto">{task.title}</p>
                  <p className="row-meta" dir="auto">{task.description || t("common.noDescription")} - {formatDate(task.dueAt ?? task.due_at)}</p>
                </div>
                <div className="toolbar">
                  <PriorityBadge value={task.priority} />
                  <StatusBadge value={task.status} />
                  {task.status !== "done" ? (
                    <button className="button" title={t("common.complete")} aria-label={t("common.complete")} onClick={() => complete(task.id)}>
                      <CheckCircle size={16} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
