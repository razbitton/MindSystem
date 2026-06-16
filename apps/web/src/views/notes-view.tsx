"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, LayoutGrid, List, Palette, Plus, RefreshCw, Search } from "lucide-react";
import { apiGet, apiPatch, apiPost, type AnyRecord } from "../lib/api";
import { dateValue, loadPreference, matchesQuery, projectName, savePreference, type ViewMode } from "../lib/view-models";
import { Drawer, EmptyState, IconButton, PageHeader, Panel, SegmentedControl } from "../components/page";
import { useI18n } from "../i18n";

const preferenceKey = "mindsystem.notes.view";
const colorStorageKey = "mindsystem.notes.colors";
const viewModes = ["cards", "list"] as const;

const noteColors = ["default", "yellow", "green", "blue", "pink", "violet"] as const;
type NoteColor = (typeof noteColors)[number];

type NoteForm = {
  title: string;
  body: string;
  projectId: string;
};

function loadColorMap(): Record<string, NoteColor> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(colorStorageKey);
    return raw ? (JSON.parse(raw) as Record<string, NoteColor>) : {};
  } catch {
    return {};
  }
}

function saveColorMap(map: Record<string, NoteColor>) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(colorStorageKey, JSON.stringify(map));
  }
}

function ColorPicker({ value, onChange, label }: { value: NoteColor; onChange: (color: NoteColor) => void; label: string }) {
  return (
    <div className="color-dots" role="group" aria-label={label}>
      {noteColors.map((color) => (
        <button
          key={color}
          type="button"
          className={`color-dot ${color}${value === color ? " selected" : ""}`}
          aria-label={color}
          aria-pressed={value === color}
          onClick={(event) => {
            event.stopPropagation();
            onChange(color);
          }}
        />
      ))}
    </div>
  );
}

export default function NotesView() {
  const { t, formatDate } = useI18n();
  const [notes, setNotes] = useState<AnyRecord[]>([]);
  const [projects, setProjects] = useState<AnyRecord[]>([]);
  const [colorMap, setColorMap] = useState<Record<string, NoteColor>>({});
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [view, setView] = useState<ViewMode>("cards");

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState<NoteForm>({ title: "", body: "", projectId: "" });
  const [composeColor, setComposeColor] = useState<NoteColor>("default");
  const composeRef = useRef<HTMLDivElement | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<AnyRecord | null>(null);
  const [form, setForm] = useState<NoteForm>({ title: "", body: "", projectId: "" });
  const [editColor, setEditColor] = useState<NoteColor>("default");

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
    setColorMap(loadColorMap());
    void load();
  }, []);

  function changeView(nextView: ViewMode) {
    setView(nextView);
    savePreference(preferenceKey, nextView);
  }

  function colorOf(note: AnyRecord): NoteColor {
    return colorMap[String(note.id)] ?? "default";
  }

  function setNoteColor(noteId: string, color: NoteColor) {
    setColorMap((current) => {
      const next = { ...current };
      if (color === "default") {
        delete next[noteId];
      } else {
        next[noteId] = color;
      }
      saveColorMap(next);
      return next;
    });
  }

  // --- inline composer ---
  function resetCompose() {
    setComposeForm({ title: "", body: "", projectId: projectFilter });
    setComposeColor("default");
  }

  async function submitCompose() {
    const title = composeForm.title.trim();
    const body = composeForm.body.trim();
    if (!title && !body) {
      setComposeOpen(false);
      resetCompose();
      return;
    }
    const payload = {
      title: title || body.slice(0, 60),
      body: body || title,
      projectId: composeForm.projectId || null
    };
    const created = await apiPost<{ note?: AnyRecord }>("/api/notes", payload);
    const newId = created?.note?.id;
    if (newId && composeColor !== "default") {
      setNoteColor(String(newId), composeColor);
    }
    setComposeOpen(false);
    resetCompose();
    await load();
  }

  // close composer when clicking outside
  useEffect(() => {
    if (!composeOpen) return;
    function handleClick(event: MouseEvent) {
      if (composeRef.current && !composeRef.current.contains(event.target as Node)) {
        void submitCompose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeOpen, composeForm, composeColor]);

  // --- edit drawer ---
  function openEdit(note: AnyRecord) {
    setEditingNote(note);
    setForm({
      title: String(note.title ?? ""),
      body: String(note.body ?? ""),
      projectId: String(note.projectId ?? note.project_id ?? "")
    });
    setEditColor(colorOf(note));
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingNote(null);
    setForm({ title: "", body: "", projectId: "" });
    setEditColor("default");
  }

  async function save() {
    if (!editingNote || (!form.title.trim() && !form.body.trim())) return;
    await apiPatch(`/api/notes/${editingNote.id}`, { ...form, projectId: form.projectId || null });
    setNoteColor(String(editingNote.id), editColor);
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
          <button className="button" type="button" onClick={load}>
            <RefreshCw size={16} aria-hidden /> {t("common.refresh")}
          </button>
        }
      />

      {/* Inline Keep-style composer */}
      {composeOpen ? (
        <div className="notes-compose" ref={composeRef}>
          <input
            className="notes-compose-title"
            dir="auto"
            autoFocus
            placeholder={t("notes.titlePlaceholder")}
            value={composeForm.title}
            onChange={(event) => setComposeForm({ ...composeForm, title: event.target.value })}
          />
          <textarea
            className="notes-compose-body"
            dir="auto"
            rows={3}
            placeholder={t("notes.bodyPlaceholder")}
            value={composeForm.body}
            onChange={(event) => setComposeForm({ ...composeForm, body: event.target.value })}
          />
          <div className="notes-compose-footer">
            <div className="notes-compose-tools">
              <ColorPicker value={composeColor} onChange={setComposeColor} label={t("notes.color")} />
              <select
                className="select compact"
                value={composeForm.projectId}
                onChange={(event) => setComposeForm({ ...composeForm, projectId: event.target.value })}
              >
                <option value="">{t("common.noProject")}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
            <button className="button primary" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void submitCompose()}>
              <Check size={16} aria-hidden /> {t("common.save")}
            </button>
          </div>
        </div>
      ) : (
        <button
          className="notes-compose-collapsed"
          type="button"
          onClick={() => {
            resetCompose();
            setComposeOpen(true);
          }}
        >
          <Plus size={18} aria-hidden /> {t("notes.takeANote")}
        </button>
      )}

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
        ) : view === "cards" ? (
          <div className="notes-masonry">
            {filteredNotes.map((note) => {
              const color = colorOf(note);
              const linkedProject = note.projectId || note.project_id ? projectName(projects, String(note.projectId ?? note.project_id)) : "";
              return (
                <div className={`note-card ${color}`} key={note.id} role="button" tabIndex={0} onClick={() => openEdit(note)} onKeyDown={(e) => { if (e.key === "Enter") openEdit(note); }}>
                  {note.title ? <p className="note-card-title" dir="auto">{note.title}</p> : null}
                  <p className="note-card-body" dir="auto">{note.body}</p>
                  <div className="note-card-footer">
                    <span className="note-chip">{linkedProject || t("common.noProject")}</span>
                    <span>{formatDate(dateValue(note, "updatedAt"))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="list-surface">
            {filteredNotes.map((note) => (
              <div className="row-item" key={note.id}>
                <span className={`note-color-bar ${colorOf(note)}`} aria-hidden />
                <div>
                  <p className="row-title" dir="auto">{note.title || note.body}</p>
                  <p className="row-meta" dir="auto">{formatDate(dateValue(note, "updatedAt"))}</p>
                </div>
                <IconButton label={t("common.edit")} onClick={() => openEdit(note)}>
                  <Palette size={16} aria-hidden />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Drawer
        open={drawerOpen}
        title={t("notes.editNote")}
        subtitle={editingNote ? formatDate(dateValue(editingNote, "updatedAt")) : t("notes.subtitle")}
        onClose={closeDrawer}
        footer={
          <>
            <button className="button" type="button" onClick={closeDrawer}>{t("common.cancel")}</button>
            <button className="button primary" type="button" onClick={save} disabled={!form.title.trim() && !form.body.trim()}>{t("common.save")}</button>
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
          <div className="form-row">
            <label>{t("notes.color")}</label>
            <ColorPicker value={editColor} onChange={setEditColor} label={t("notes.color")} />
          </div>
        </div>
      </Drawer>
    </>
  );
}
