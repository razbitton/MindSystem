"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, LayoutGrid, List, Plus, RefreshCw, Search } from "lucide-react";
import { apiGet, apiPatch, apiPost, type AnyRecord } from "../lib/api";
import { dateValue, loadPreference, matchesQuery, projectName, savePreference, truncate, type ViewMode } from "../lib/view-models";
import { Drawer, EmptyState, IconButton, PageHeader, Panel, SegmentedControl } from "../components/page";
import { useI18n } from "../i18n";

const preferenceKey = "mindsystem.notes.view";
const viewModes = ["cards", "list"] as const;

type NoteForm = {
  title: string;
  body: string;
  projectId: string;
};

export default function NotesView() {
  const { t, formatDate } = useI18n();
  const [notes, setNotes] = useState<AnyRecord[]>([]);
  const [projects, setProjects] = useState<AnyRecord[]>([]);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [view, setView] = useState<ViewMode>("cards");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<AnyRecord | null>(null);
  const [form, setForm] = useState<NoteForm>({ title: "", body: "", projectId: "" });

  async function load() {
    const [noteData, projectData] = await Promise.all([
      apiGet<{ notes: AnyRecord[] }>("/api/notes"),
      apiGet<{ projects: AnyRecord[] }>("/api/projects")
    ]);
    setNotes(noteData.notes);
    setProjects(projectData.projects);
  }

  useEffect(() => {
    setView(loadPreference(preferenceKey, "cards", viewModes));
    void load();
  }, []);

  function changeView(nextView: ViewMode) {
    setView(nextView);
    savePreference(preferenceKey, nextView);
  }

  function openCreate() {
    setEditingNote(null);
    setForm({ title: "", body: "", projectId: projectFilter });
    setDrawerOpen(true);
  }

  function openEdit(note: AnyRecord) {
    setEditingNote(note);
    setForm({
      title: String(note.title ?? ""),
      body: String(note.body ?? ""),
      projectId: String(note.projectId ?? note.project_id ?? "")
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingNote(null);
    setForm({ title: "", body: "", projectId: "" });
  }

  async function save() {
    if (!form.title.trim() || !form.body.trim()) return;
    const payload = { ...form, projectId: form.projectId || null };
    if (editingNote) {
      await apiPatch(`/api/notes/${editingNote.id}`, payload);
    } else {
      await apiPost("/api/notes", payload);
    }
    closeDrawer();
    await load();
  }

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const noteProjectId = String(note.projectId ?? note.project_id ?? "");
      const matchesProject = !projectFilter || noteProjectId === projectFilter;
      return matchesProject && matchesQuery(note, query, ["title", "body"]);
    });
  }, [notes, projectFilter, query]);

  return (
    <>
      <PageHeader
        title={t("notes.title")}
        subtitle={t("notes.subtitle")}
        actions={
          <>
            <button className="button" type="button" onClick={load}>
              <RefreshCw size={16} aria-hidden /> {t("common.refresh")}
            </button>
            <button className="button primary" type="button" onClick={openCreate}>
              <Plus size={16} aria-hidden /> {t("notes.newNote")}
            </button>
          </>
        }
      />

      <Panel>
        <div className="filter-bar">
          <div className="shell-search" style={{ flex: "1 1 260px" }}>
            <Search size={16} aria-hidden />
            <input dir="auto" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("notes.searchPlaceholder")} />
          </div>
          <select className="select" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} style={{ maxWidth: 240 }}>
            <option value="">{t("notes.allProjects")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <SegmentedControl
            label={t("common.view")}
            value={view}
            onChange={changeView}
            options={[
              { value: "cards", label: t("common.cards"), icon: <LayoutGrid size={15} aria-hidden /> },
              { value: "list", label: t("common.list"), icon: <List size={15} aria-hidden /> }
            ]}
          />
        </div>

        {!filteredNotes.length ? (
          <EmptyState title={t("notes.empty")}>
            {query || projectFilter ? t("common.emptySearch") : t("home.captureHelp")}
          </EmptyState>
        ) : null}

        {view === "cards" ? (
          <div className="cards-grid">
            {filteredNotes.map((note) => (
              <button className="item-card" type="button" key={note.id} onClick={() => openEdit(note)}>
                <div className="item-card-header">
                  <div>
                    <p className="item-card-title" dir="auto">{note.title}</p>
                    <p className="item-card-body" dir="auto">{truncate(note.body, 210)}</p>
                  </div>
                  <Edit3 size={17} aria-hidden />
                </div>
                <div className="item-card-meta">
                  <span>{formatDate(dateValue(note, "updatedAt"))}</span>
                  {note.projectId || note.project_id ? <span>{projectName(projects, String(note.projectId ?? note.project_id))}</span> : <span>{t("common.noProject")}</span>}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="list-surface">
            {filteredNotes.map((note) => (
              <div className="row-item" key={note.id}>
                <div>
                  <p className="row-title" dir="auto">{note.title}</p>
                  <p className="row-meta" dir="auto">{truncate(note.body, 220)} - {formatDate(dateValue(note, "updatedAt"))}</p>
                </div>
                <IconButton label={t("common.edit")} onClick={() => openEdit(note)}>
                  <Edit3 size={16} aria-hidden />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Drawer
        open={drawerOpen}
        title={editingNote ? t("notes.editNote") : t("notes.newNote")}
        subtitle={editingNote ? formatDate(dateValue(editingNote, "updatedAt")) : t("notes.subtitle")}
        onClose={closeDrawer}
        footer={
          <>
            <button className="button" type="button" onClick={closeDrawer}>{t("common.cancel")}</button>
            <button className="button primary" type="button" onClick={save} disabled={!form.title.trim() || !form.body.trim()}>{t("common.save")}</button>
          </>
        }
      >
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="note-title">{t("common.title")}</label>
            <input id="note-title" className="input" dir="auto" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </div>
          <div className="form-row">
            <label htmlFor="note-body">{t("common.body")}</label>
            <textarea id="note-body" className="textarea" dir="auto" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
          </div>
          <div className="form-row">
            <label htmlFor="note-project">{t("common.project")}</label>
            <select id="note-project" className="select" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
              <option value="">{t("common.noProject")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Drawer>
    </>
  );
}
