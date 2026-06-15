"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel, PriorityBadge, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";

const priorities = ["low", "medium", "high", "urgent"] as const;

export default function ProjectsView() {
  const { t, formatDate, translateValue } = useI18n();
  const [projects, setProjects] = useState<AnyRecord[]>([]);
  const [form, setForm] = useState({ name: "", description: "", priority: "medium" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
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

  async function create() {
    if (!form.name.trim()) return;
    await apiPost("/api/projects", form);
    setForm({ name: "", description: "", priority: "medium" });
    await load();
  }

  return (
    <>
      <PageHeader title={t("projects.title")} subtitle={t("projects.subtitle")} />
      <div className="grid two">
        <Panel title={t("projects.createPanel")}>
          <div className="form-grid">
            <input className="input" dir="auto" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t("projects.namePlaceholder")} />
            <textarea className="textarea" dir="auto" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={t("common.description")} />
            <select className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              {priorities.map((priority) => (
                <option key={priority} value={priority}>{translateValue("priority", priority)}</option>
              ))}
            </select>
            <button className="button primary" onClick={create}>
              <Plus size={16} /> {t("common.create")}
            </button>
          </div>
        </Panel>
        <Panel title={t("projects.activeList")}>
          {error ? <EmptyState>{error}</EmptyState> : null}
          {!projects.length ? <EmptyState>{t("projects.empty")}</EmptyState> : null}
          <div className="row-list">
            {projects.map((project) => (
              <Link className="row-item" key={project.id} href={`/projects/${project.id}`}>
                <div>
                  <p className="row-title" dir="auto">{project.name}</p>
                  <p className="row-meta" dir="auto">{project.description || t("common.noDescription")} - {formatDate(project.updatedAt ?? project.updated_at)}</p>
                </div>
                <div className="toolbar">
                  <PriorityBadge value={project.priority} />
                  <StatusBadge value={project.status} />
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
