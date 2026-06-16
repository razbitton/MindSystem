"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Edit3, FolderKanban, Plus, RefreshCw, Search } from "lucide-react";
import { apiGet, apiPatch, apiPost, type AnyRecord } from "../lib/api";
import { dateValue, fromDateTimeInput, matchesQuery, toDateTimeInput, truncate } from "../lib/view-models";
import { Drawer, EmptyState, IconButton, PageHeader, Panel, PriorityBadge, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";

const priorities = ["low", "medium", "high", "urgent"] as const;
const statuses = ["active", "paused", "completed", "archived"] as const;

type ProjectForm = {
  name: string;
  description: string;
  goal: string;
  status: string;
  priority: string;
  dueAt: string;
};

export default function ProjectsView() {
  const { t, formatDate, translateValue } = useI18n();
  const [projects, setProjects] = useState<AnyRecord[]>([]);
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<AnyRecord | null>(null);
  const [form, setForm] = useState<ProjectForm>(blankForm());
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await apiGet<{ projects: AnyRecord[] }>("/api/projects");
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("projects.loadError"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditingProject(null);
    setForm(blankForm());
    setDrawerOpen(true);
  }

  function openEdit(project: AnyRecord) {
    setEditingProject(project);
    setForm({
      name: String(project.name ?? ""),
      description: String(project.description ?? ""),
      goal: String(project.goal ?? ""),
      status: String(project.status ?? "active"),
      priority: String(project.priority ?? "medium"),
      dueAt: toDateTimeInput(dateValue(project, "dueAt"))
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingProject(null);
    setForm(blankForm());
  }

  async function save() {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name,
      description: form.description || undefined,
      goal: form.goal || undefined,
      status: form.status,
      priority: form.priority,
      dueAt: fromDateTimeInput(form.dueAt)
    };
    if (editingProject) {
      await apiPatch(`/api/projects/${editingProject.id}`, payload);
    } else {
      await apiPost("/api/projects", payload);
    }
    closeDrawer();
    await load();
  }

  const filteredProjects = useMemo(() => projects.filter((project) => matchesQuery(project, query, ["name", "description", "goal", "status", "priority"])), [projects, query]);

  return (
    <>
      <PageHeader
        title={t("projects.title")}
        subtitle={t("projects.subtitle")}
        actions={
          <>
            <button className="button" type="button" onClick={load}>
              <RefreshCw size={16} aria-hidden /> {t("common.refresh")}
            </button>
            <button className="button primary" type="button" onClick={openCreate}>
              <Plus size={16} aria-hidden /> {t("projects.newProject")}
            </button>
          </>
        }
      />

      <Panel>
        <div className="filter-bar">
          <div className="shell-search" style={{ flex: "1 1 280px" }}>
            <Search size={16} aria-hidden />
            <input dir="auto" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("projects.searchPlaceholder")} />
          </div>
        </div>

        {error ? <EmptyState>{error}</EmptyState> : null}
        {!filteredProjects.length ? <EmptyState title={t("projects.empty")}>{t("common.emptySearch")}</EmptyState> : null}

        <div className="cards-grid">
          {filteredProjects.map((project) => (
            <article className="item-card" key={project.id}>
              <div className="item-card-header">
                <Link href={`/projects/${project.id}`} aria-label={`${t("projects.openProject")}: ${project.name}`}>
                  <p className="item-card-title" dir="auto">{project.name}</p>
                </Link>
                <IconButton label={t("common.edit")} onClick={() => openEdit(project)}>
                  <Edit3 size={16} aria-hidden />
                </IconButton>
              </div>
              <p className="item-card-body" dir="auto">{truncate(project.description || project.goal, 180) || t("common.noDescription")}</p>
              <div className="item-card-meta">
                <PriorityBadge value={project.priority} />
                <StatusBadge value={project.status} />
                <span>{formatDate(dateValue(project, "updatedAt"))}</span>
              </div>
              <div className="toolbar space-between">
                <span className="meta-item">
                  <FolderKanban size={15} aria-hidden />
                  <strong dir="auto">{project.goal || t("projects.noGoal")}</strong>
                </span>
                <Link className="button subtle" href={`/projects/${project.id}`}>{t("common.open")}</Link>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <Drawer
        open={drawerOpen}
        title={editingProject ? t("projects.editProject") : t("projects.newProject")}
        subtitle={editingProject ? formatDate(dateValue(editingProject, "updatedAt")) : t("projects.subtitle")}
        onClose={closeDrawer}
        footer={
          <>
            <button className="button" type="button" onClick={closeDrawer}>{t("common.cancel")}</button>
            <button className="button primary" type="button" onClick={save} disabled={!form.name.trim()}>{t("common.save")}</button>
          </>
        }
      >
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="project-name">{t("common.title")}</label>
            <input id="project-name" className="input" dir="auto" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div className="form-row">
            <label htmlFor="project-description">{t("common.description")}</label>
            <textarea id="project-description" className="textarea" dir="auto" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>
          <div className="form-row">
            <label htmlFor="project-goal">{t("projects.goal")}</label>
            <textarea id="project-goal" className="textarea" dir="auto" value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} />
          </div>
          <div className="grid two">
            <div className="form-row">
              <label htmlFor="project-status">{t("common.status")}</label>
              <select id="project-status" className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                {statuses.map((status) => (
                  <option key={status} value={status}>{translateValue("status", status)}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="project-priority">{t("common.priority")}</label>
              <select id="project-priority" className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>{translateValue("priority", priority)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="project-due">{t("common.due")}</label>
            <input id="project-due" className="input" type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} />
          </div>
        </div>
      </Drawer>
    </>
  );
}

function blankForm(): ProjectForm {
  return {
    name: "",
    description: "",
    goal: "",
    status: "active",
    priority: "medium",
    dueAt: ""
  };
}
