"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Edit3, Folder, LayoutGrid, List, PenSquare, RefreshCw, Search } from "lucide-react";
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
import { cn } from "@/lib/utils";
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
      const target = event.target as HTMLElement;
      if (target.closest("[data-slot='select-content']")) return;
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

      <div ref={composeRef} className="mx-auto w-full max-w-xl">
        <NoteEditorPanel
          form={composeForm}
          projects={projects}
          expanded={composeOpen}
          mode="compose"
          onExpand={() => {
            resetCompose();
            setComposeOpen(true);
          }}
          onChange={setComposeForm}
          onSave={() => void submitCompose()}
        />
      </div>

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
                const linkedProjectId = String(note.projectId ?? note.project_id ?? "");
                const linkedProject = linkedProjectId ? projectName(projects, linkedProjectId) : "";
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
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5">
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
                const linkedProjectId = String(note.projectId ?? note.project_id ?? "");
                const linkedProject = linkedProjectId ? projectName(projects, linkedProjectId) : "";
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
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5">
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
        contentClassName="border-0 bg-transparent p-0 shadow-none sm:max-w-xl"
        bodyClassName="overflow-visible p-0 sm:p-0"
      >
        <NoteEditorPanel
          form={form}
          projects={projects}
          expanded
          mode="edit"
          onChange={setForm}
          onClose={closeDrawer}
          onSave={() => void save()}
          saveDisabled={!form.title.trim() && !form.body.trim()}
        />
      </Drawer>
    </div>
  );
}

function NoteEditorPanel({
  form,
  projects,
  expanded,
  mode,
  onChange,
  onExpand,
  onClose,
  onSave,
  saveDisabled = false
}: {
  form: NoteForm;
  projects: AnyRecord[];
  expanded: boolean;
  mode: "compose" | "edit";
  onChange: (next: NoteForm) => void;
  onExpand?: () => void;
  onClose?: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
}) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const maxHeight = mode === "edit" ? 420 : 260;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [expanded, form.body, mode]);

  function expandIfNeeded() {
    if (!expanded) onExpand?.();
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-visible rounded-xl border border-border bg-card text-card-foreground shadow-xs transition-all duration-200",
        expanded ? "shadow-lg shadow-black/10" : "hover:border-primary/40 hover:shadow-md",
        mode === "edit" && "max-h-[min(42rem,calc(100svh_-_2rem))]"
      )}
    >
      <div
        className={cn(
          "flex flex-col p-3 sm:p-4",
          mode === "edit" && "max-h-[min(34rem,calc(100svh_-_8rem))] overflow-y-auto"
        )}
      >
        {expanded ? (
          <Input
            aria-label={t("common.title")}
            autoFocus={mode === "edit"}
            dir="auto"
            placeholder={t("notes.titlePlaceholder")}
            value={form.title}
            onChange={(event) => onChange({ ...form, title: event.target.value })}
            className="h-auto rounded-none border-0 bg-transparent px-1 py-0 pe-10 text-base font-semibold shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-base"
          />
        ) : null}

        <div className={cn("relative flex items-start gap-2", expanded && "mt-3")}>
          <Textarea
            ref={textareaRef}
            aria-label={t("common.body")}
            dir="auto"
            rows={expanded ? (mode === "edit" ? 8 : 3) : 1}
            placeholder={expanded ? t("notes.bodyPlaceholder") : t("notes.takeANote")}
            value={form.body}
            onClick={expandIfNeeded}
            onFocus={expandIfNeeded}
            onChange={(event) => onChange({ ...form, body: event.target.value })}
            className={cn(
              "min-h-11 resize-none overflow-hidden rounded-none border-0 bg-transparent px-1 py-0 text-sm leading-relaxed shadow-none focus-visible:border-transparent focus-visible:ring-0",
              !expanded && "pe-10 text-muted-foreground"
            )}
          />
          {!expanded ? (
            <button
              type="button"
              aria-label={t("notes.newNote")}
              onClick={expandIfNeeded}
              className="absolute end-0 top-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PenSquare className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 pb-3 transition-all duration-200 sm:px-4",
          expanded ? "max-h-20 opacity-100" : "pointer-events-none max-h-0 overflow-hidden pb-0 opacity-0"
        )}
      >
        <ProjectPillSelect
          value={form.projectId}
          projects={projects}
          onChange={(projectId) => onChange({ ...form, projectId })}
        />
        <div className="flex items-center gap-2">
          {mode === "edit" && onClose ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onSave}
            disabled={saveDisabled}
          >
            <Check data-icon="inline-start" />
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProjectPillSelect({
  value,
  projects,
  onChange
}: {
  value: string;
  projects: AnyRecord[];
  onChange: (projectId: string) => void;
}) {
  const { t } = useI18n();

  return (
    <Select value={value || NO_PROJECT} onValueChange={(next) => onChange(next === NO_PROJECT ? "" : next)}>
      <SelectTrigger
        size="sm"
        className="max-w-[14rem] rounded-full border-border bg-muted/60 px-3 text-xs shadow-none transition-colors hover:bg-muted"
      >
        <Folder className="size-3.5" aria-hidden />
        <SelectValue placeholder={t("common.noProject")} />
      </SelectTrigger>
      <SelectContent position="popper" align="end" className="min-w-48 rounded-xl">
        <SelectItem value={NO_PROJECT}>{t("common.noProject")}</SelectItem>
        {projects.map((project) => {
          const projectId = String(project.id);
          return (
            <SelectItem key={projectId} value={projectId}>
              <span dir="auto">{project.name}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
