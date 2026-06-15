"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel } from "../components/page";
import { useI18n } from "../i18n";

export default function NotesView() {
  const { t, formatDate } = useI18n();
  const [notes, setNotes] = useState<AnyRecord[]>([]);
  const [projects, setProjects] = useState<AnyRecord[]>([]);
  const [form, setForm] = useState({ title: "", body: "", projectId: "" });

  async function load() {
    const [noteData, projectData] = await Promise.all([
      apiGet<{ notes: AnyRecord[] }>("/api/notes"),
      apiGet<{ projects: AnyRecord[] }>("/api/projects")
    ]);
    setNotes(noteData.notes);
    setProjects(projectData.projects);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    if (!form.title.trim() || !form.body.trim()) return;
    await apiPost("/api/notes", { ...form, projectId: form.projectId || null });
    setForm({ title: "", body: "", projectId: "" });
    await load();
  }

  return (
    <>
      <PageHeader title={t("notes.title")} subtitle={t("notes.subtitle")} actions={<button className="button" onClick={load}><RefreshCw size={16} /> {t("common.refresh")}</button>} />
      <div className="grid two">
        <Panel title={t("notes.createPanel")}>
          <div className="form-grid">
            <input className="input" dir="auto" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t("common.title")} />
            <textarea className="textarea" dir="auto" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder={t("common.body")} />
            <select className="select" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
              <option value="">{t("common.noProject")}</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button className="button primary" onClick={create}><Plus size={16} /> {t("common.create")}</button>
          </div>
        </Panel>
        <Panel title={t("notes.list")}>
          {!notes.length ? <EmptyState>{t("notes.empty")}</EmptyState> : null}
          <div className="row-list">
            {notes.map((note) => (
              <div className="row-item" key={note.id}>
                <div>
                  <p className="row-title" dir="auto">{note.title}</p>
                  <p className="row-meta" dir="auto">{note.body.slice(0, 220)} - {formatDate(note.updatedAt ?? note.updated_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
