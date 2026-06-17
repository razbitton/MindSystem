"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Edit3, LayoutGrid, List, Plus, RefreshCw, Search } from "lucide-react";
import { apiPatch, apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateWorkspaceQueryCache,
  peekCachedQuery
} from "../lib/query-cache";
import { dateValue, loadPreference, matchesQuery, projectName, savePreference, type ViewMode } from "../lib/view-models";
import { Drawer, EmptyState, IconButton, PageHeader, Panel, SegmentedControl } from "../components/page";
import { useI18n } from "../i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

const preferenceKey = "mindsystem.notes.view";
const viewModes = ["cards", "list"] as const;
const NO_PROJECT = "__none__";
const ALL_PROJECTS = "__all__";

type NoteForm = {
  title: string;
  body: string;
  projectId: string;
};

export default function NotesView() {
  const { t, formatDate } = useI18n();
  const [notes, setNotes] = useState<AnyRecord[]>(
    () => peekCachedQuery<{ notes: AnyRecord[] }>("/api/notes")?.notes ?? []
  );
  const [projects, setProjects] = useState<AnyRecord[]>(
    () => peekCachedQuery<{ projects: AnyRecord[] }>("/api/projects")?.projects ?? []
  );
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [view, setView] = useState<ViewMode>("cards");

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState<NoteForm>({ title: "", body: "", projectId: "" });
  const composeRef = useRef<HTMLDivElement | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<AnyRecord | null>(null);
  const [form, setForm] = useState<NoteForm>({ title: "", body: "", projectId: "" });

  async function load(force = false) {
    const [noteData, projectData] = await Promise.all([
      cachedApiGet<{ notes: AnyRecord[] }>("/api/notes", undefined, { force }),
      cachedApiGet<{ projects: AnyRecord[] }>("/api/projects", undefined, { force })
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

  function resetCompose() {
    setComposeForm({ title: "", body: "", projectId: projectFilter });
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
    await apiPost("/api/notes", payload);
    setComposeOpen(false);
    resetCompose();
    invalidateWorkspaceQueryCache();
    await load(true);
  }

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
  }, [composeOpen, composeForm]);

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
    if (!editingNote || (!form.title.trim() && !form.body.trim())) return;
    const title = form.title.trim();
    const body = form.body.trim();
    await apiPatch(`/api/notes/${editingNote.id}`, {
      title: title || body.slice(0, 60),
      body: body || title,
      projectId: form.projectId || null
    });
    closeDrawer();
    invalidateWorkspaceQueryCache();
    await load(true);
  }

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const noteProjectId = String(note.projectId ?? note.project_id ?? "");
      const matchesProject = !projectFilter || noteProjectId === projectFilter;
      return matchesProject && matchesQuery(note, query, ["title", "body"]);
    });
  }, [notes, projectFilter, query]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("notes.title")}
        subtitle={t("notes.subtitle")}
        actions={
          <Button variant="outline" size="sm" type="button" onClick={() => load(true)}>
            <RefreshCw data-icon="inline-start" />
            {t("common.refresh")}
          </Button>
        }
      />

      {composeOpen ? (
        <div
          ref={composeRef}
          className="bounded-surface bounded-surface-tight flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xs"
        >
          <Input
            dir="auto"
            autoFocus
            className="border-0 px-1 text-base font-medium shadow-none focus-visible:ring-0"
            placeholder={t("notes.titlePlaceholder")}
            value={composeForm.title}
            onChange={(event) => setComposeForm({ ...composeForm, title: event.target.value })}
          />
          <Textarea
            dir="auto"
            rows={3}
            className="border-0 px-1 shadow-none focus-visible:ring-0"
            placeholder={t("notes.bodyPlaceholder")}
            value={composeForm.body}
            onChange={(event) => setComposeForm({ ...composeForm, body: event.target.value })}
          />
          <div className="flex shrink-0 items-center justify-between gap-2">
            <Select
              value={composeForm.projectId || NO_PROJECT}
              onValueChange={(value) =>
                setComposeForm({ ...composeForm, projectId: value === NO_PROJECT ? "" : value })
              }
            >
              <SelectTrigger size="sm" className="w-44">
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
            <Button
              type="button"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void submitCompose()}
            >
              <Check data-icon="inline-start" />
              {t("common.save")}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            resetCompose();
            setComposeOpen(true);
          }}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="size-[18px]" aria-hidden />
          {t("notes.takeANote")}
        </button>
      )}

      <Panel>
        <div className="flex flex-col gap-3">
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
                placeholder={t("notes.searchPlaceholder")}
                className="ps-9"
              />
            </div>
            <Select
              value={projectFilter || ALL_PROJECTS}
              onValueChange={(value) => setProjectFilter(value === ALL_PROJECTS ? "" : value)}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder={t("notes.allProjects")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROJECTS}>{t("notes.allProjects")}</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <div className="bounded-scroll columns-1 gap-3 sm:columns-2 lg:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid [max-block-size:min(62rem,calc(100svh_-_10rem))]">
              {filteredNotes.map((note) => {
                const linkedProject =
                  note.projectId || note.project_id
                    ? projectName(projects, String(note.projectId ?? note.project_id))
                    : "";
                return (
                  <div
                    key={note.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(note)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openEdit(note);
                      }
                    }}
                    className="bounded-scroll flex cursor-pointer flex-col gap-2 rounded-xl border border-border bg-card p-4 text-start shadow-xs transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [max-block-size:min(40rem,calc(100svh_-_10rem))]"
                  >
                    {note.title ? (
                      <p className="text-sm font-semibold text-foreground" dir="auto">
                        {note.title}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground" dir="auto">
                      {note.body}
                    </p>
                    <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-0.5">
                        {linkedProject || t("common.noProject")}
                      </span>
                      <span>{formatDate(dateValue(note, "updatedAt"))}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <ul className="bounded-scroll flex flex-col divide-y divide-border rounded-xl border border-border [max-block-size:min(56rem,calc(100svh_-_10rem))]">
              {filteredNotes.map((note) => {
                const linkedProject =
                  note.projectId || note.project_id
                    ? projectName(projects, String(note.projectId ?? note.project_id))
                    : "";
                return (
                  <li
                    key={note.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(note)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openEdit(note);
                      }
                    }}
                    className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-sm font-medium text-foreground" dir="auto">
                        {note.title || note.body}
                      </p>
                      {note.body && note.title ? (
                        <p className="line-clamp-2 text-sm text-muted-foreground" dir="auto">
                          {note.body}
                        </p>
                      ) : null}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full bg-muted px-2 py-0.5">
                          {linkedProject || t("common.noProject")}
                        </span>
                        <span>{formatDate(dateValue(note, "updatedAt"))}</span>
                      </div>
                    </div>
                    <IconButton
                      label={t("common.edit")}
                      onClick={(event) => {
                        event.stopPropagation();
                        openEdit(note);
                      }}
                    >
                      <Edit3 className="size-4" aria-hidden />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Panel>

      <Drawer
        open={drawerOpen}
        title={t("notes.editNote")}
        onClose={closeDrawer}
        hideHeader
        bodyClassName="p-0 sm:p-0"
        footerClassName="border-t-0 bg-background px-4 pb-4 pt-2 sm:px-5"
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeDrawer}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={save} disabled={!form.title.trim() && !form.body.trim()}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="flex min-h-[min(34rem,calc(100svh_-_9rem))] flex-col bg-card">
          <div className="flex flex-1 flex-col px-4 pb-4 pt-10 sm:px-6">
            <Input
              id="note-title"
              aria-label={t("common.title")}
              dir="auto"
              placeholder={t("notes.titlePlaceholder")}
              className="h-auto rounded-none border-0 bg-transparent px-0 py-0 pe-10 text-xl font-semibold shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-xl"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
            <Textarea
              id="note-body"
              aria-label={t("common.body")}
              dir="auto"
              rows={14}
              placeholder={t("notes.bodyPlaceholder")}
              className="mt-4 min-h-72 resize-none rounded-none border-0 bg-transparent px-0 py-0 text-base leading-relaxed shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-base"
              value={form.body}
              onChange={(event) => setForm({ ...form, body: event.target.value })}
            />
          </div>
          <div className="border-t border-border px-4 py-3 sm:px-6">
            <Select
              value={form.projectId || NO_PROJECT}
              onValueChange={(value) => setForm({ ...form, projectId: value === NO_PROJECT ? "" : value })}
            >
              <SelectTrigger id="note-project" size="sm" className="w-full border-0 bg-muted/60 shadow-none sm:w-56">
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
        </div>
      </Drawer>
    </div>
  );
}
