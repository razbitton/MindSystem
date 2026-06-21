"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Folder, PenSquare, Search, Trash2 } from "lucide-react";
import { apiDelete, apiPatch, apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateCachedQueries,
  peekCachedQuery,
  setCachedQuery
} from "../lib/query-cache";
import { dateValue, matchesQuery, projectName } from "../lib/view-models";
import { Drawer, EmptyState, IconButton, PageHeader } from "../components/page";
import { ConfirmDialog } from "../components/confirm-dialog";
import { useI18n, type Direction } from "../i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

const NO_PROJECT = "__none__";
const ALL_PROJECTS = "__all__";

type NoteForm = {
  title: string;
  body: string;
  projectId: string;
};

type NotesViewProps = {
  initialNotes?: AnyRecord[];
  initialProjects?: AnyRecord[];
};

const rtlTextPattern = /[\u0590-\u08FF\uFB1D-\uFEFC]/;
const ltrTextPattern = /[A-Za-z\u00C0-\u024F]/;

function resolveTextDirection(value: string, fallback: Direction): Direction {
  const text = value.trim();
  if (!text) return fallback;
  if (rtlTextPattern.test(text)) return "rtl";
  if (ltrTextPattern.test(text)) return "ltr";
  return fallback;
}

export default function NotesView({ initialNotes, initialProjects }: NotesViewProps = {}) {
  const { t, formatDate, direction } = useI18n();
  const [notes, setNotes] = useState<AnyRecord[]>(
    () => initialNotes ?? peekCachedQuery<{ notes: AnyRecord[] }>("/api/notes")?.notes ?? []
  );
  const [projects, setProjects] = useState<AnyRecord[]>(
    () => initialProjects ?? peekCachedQuery<{ projects: AnyRecord[] }>("/api/projects")?.projects ?? []
  );
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState<NoteForm>({ title: "", body: "", projectId: "" });
  const composeRef = useRef<HTMLDivElement | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<AnyRecord | null>(null);
  const [form, setForm] = useState<NoteForm>({ title: "", body: "", projectId: "" });
  const [deleteTarget, setDeleteTarget] = useState<AnyRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load(force = false) {
    const [noteData, projectData] = await Promise.all([
      cachedApiGet<{ notes: AnyRecord[] }>("/api/notes", undefined, { force }),
      cachedApiGet<{ projects: AnyRecord[] }>("/api/projects", undefined, { force })
    ]);
    setNotes(noteData.notes);
    setProjects(projectData.projects);
  }

  function invalidateNoteQueryCache() {
    invalidateCachedQueries((key) =>
      key.startsWith("GET /api/notes") ||
      key.startsWith("GET /api/dashboard") ||
      key.startsWith("GET /api/projects/")
    );
  }

  useEffect(() => {
    if (initialNotes) {
      setCachedQuery("/api/notes", undefined, { notes: initialNotes });
      setNotes(initialNotes);
    }
    if (initialProjects) {
      setCachedQuery("/api/projects", undefined, { projects: initialProjects });
      setProjects(initialProjects);
    }
  }, [initialNotes, initialProjects]);

  useEffect(() => {
    if (initialNotes && initialProjects) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    try {
      await apiPost("/api/notes", payload);
      setComposeOpen(false);
      resetCompose();
      invalidateNoteQueryCache();
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
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
    try {
      await apiPatch(`/api/notes/${editingNote.id}`, {
        title: title || body.slice(0, 60),
        body: body || title,
        projectId: form.projectId || null
      });
      closeDrawer();
      invalidateNoteQueryCache();
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  function requestDelete(note: AnyRecord, event?: { stopPropagation: () => void }) {
    event?.stopPropagation();
    setDeleteTarget(note);
  }

  async function deleteSelectedNote() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/notes/${deleteTarget.id}`);
      if (editingNote?.id === deleteTarget.id) closeDrawer();
      setDeleteTarget(null);
      invalidateNoteQueryCache();
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setDeleting(false);
    }
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
      <header className="hidden items-center justify-between gap-6 border-b border-border pb-4 md:flex">
        <h1
          className="min-w-0 text-pretty text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
          dir="auto"
        >
          {t("notes.title")}
        </h1>

        <NotesSearchProjectFilter
          query={query}
          projectFilter={projectFilter}
          projects={projects}
          onQueryChange={setQuery}
          onProjectFilterChange={setProjectFilter}
          className="w-[34rem]"
        />
      </header>

      <div className="md:hidden">
        <PageHeader title={t("notes.title")} subtitle={t("notes.subtitle")} />
      </div>

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

      <section className="flex flex-col gap-4">
        <NotesSearchProjectFilter
          query={query}
          projectFilter={projectFilter}
          projects={projects}
          onQueryChange={setQuery}
          onProjectFilterChange={setProjectFilter}
          className="md:hidden"
        />

        {!filteredNotes.length ? (
          <EmptyState title={t("notes.empty")}>
            {query || projectFilter ? t("common.emptySearch") : t("home.captureHelp")}
          </EmptyState>
        ) : (
          <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
            {filteredNotes.map((note) => {
              const linkedProjectId = String(note.projectId ?? note.project_id ?? "");
              const linkedProject = linkedProjectId ? projectName(projects, linkedProjectId) : "";
              const noteDirection = resolveTextDirection(`${String(note.title ?? "")}\n${String(note.body ?? "")}`, direction);
              const projectDirection = resolveTextDirection(linkedProject || t("common.noProject"), direction);
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
                  className="flex max-h-56 cursor-pointer flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-4 text-start shadow-xs transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {note.title ? (
                    <p className="line-clamp-2 break-words text-start text-sm font-semibold text-foreground" dir={noteDirection}>
                      {note.title}
                    </p>
                  ) : null}
                  <p className="line-clamp-6 break-words text-start text-sm leading-relaxed text-muted-foreground" dir={noteDirection}>
                    {note.body}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-0 py-0.5 text-muted-foreground" dir={projectDirection}>
                      <span className="truncate">{linkedProject || t("common.noProject")}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span>{formatDate(dateValue(note, "updatedAt"))}</span>
                      <IconButton
                        label={t("common.delete")}
                        action="delete"
                        className="size-7"
                        onClick={(event) => requestDelete(note, event)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </IconButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

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
          {...(editingNote ? { onDelete: () => requestDelete(editingNote) } : {})}
          saveDisabled={!form.title.trim() && !form.body.trim()}
        />
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("notes.deleteNote")}
        description={t("notes.deleteConfirm", {
          title: String(deleteTarget?.title || deleteTarget?.body || t("entity.note"))
        })}
        confirmLabel={deleting ? t("common.deleting") : t("common.delete")}
        destructive
        loading={deleting}
        onConfirm={() => void deleteSelectedNote()}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function NotesSearchProjectFilter({
  query,
  projectFilter,
  projects,
  onQueryChange,
  onProjectFilterChange,
  className
}: {
  query: string;
  projectFilter: string;
  projects: AnyRecord[];
  onQueryChange: (query: string) => void;
  onProjectFilterChange: (projectId: string) => void;
  className?: string;
}) {
  const { t, direction } = useI18n();

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        className
      )}
      dir="ltr"
    >
      <Select
        value={projectFilter || ALL_PROJECTS}
        onValueChange={(value) => onProjectFilterChange(value === ALL_PROJECTS ? "" : value)}
      >
        <SelectTrigger
          aria-label={t("common.project")}
          className={cn(
            "h-9 w-[8.75rem] min-w-0 shrink-0 rounded-lg border-border bg-secondary/70 px-2 text-xs shadow-none focus:ring-0 focus-visible:ring-0 sm:w-[9.5rem]",
            projectFilter && "text-primary"
          )}
        >
          <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <SelectValue placeholder={t("notes.allProjects")} />
        </SelectTrigger>
        <SelectContent position="popper" align="end" className="min-w-48 rounded-xl">
          <SelectItem value={ALL_PROJECTS}>
            <span dir={direction}>{t("notes.allProjects")}</span>
          </SelectItem>
          {projects.map((project) => {
            const projectNameText = String(project.name ?? "");
            return (
              <SelectItem key={project.id} value={String(project.id)}>
                <span dir={resolveTextDirection(projectNameText, direction)}>{projectNameText}</span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <div className="relative min-w-0 flex-1 md:w-72 md:flex-none">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          dir={direction}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={`${t("notes.searchPlaceholder")}...`}
          className={cn(
            "h-9 rounded-lg border-border bg-secondary/70 pl-10 pr-3 text-sm shadow-none focus-visible:ring-1",
            direction === "rtl" ? "text-right" : "text-left"
          )}
        />
      </div>
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
  onDelete,
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
  onDelete?: () => void;
  saveDisabled?: boolean;
}) {
  const { t, direction } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleDirection = resolveTextDirection(form.title || form.body, direction);
  const bodyDirection = resolveTextDirection(form.body || form.title, direction);

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
            dir={titleDirection}
            placeholder={t("notes.titlePlaceholder")}
            value={form.title}
            onChange={(event) => onChange({ ...form, title: event.target.value })}
            className="h-auto rounded-none border-0 bg-transparent px-1 py-0 pe-10 text-start text-base font-semibold shadow-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent md:text-base"
          />
        ) : null}

        <div className={cn("relative flex items-start gap-2", expanded && "mt-3")}>
          <Textarea
            ref={textareaRef}
            aria-label={t("common.body")}
            dir={bodyDirection}
            rows={expanded ? (mode === "edit" ? 8 : 3) : 1}
            placeholder={expanded ? t("notes.bodyPlaceholder") : t("notes.takeANote")}
            value={form.body}
            onClick={expandIfNeeded}
            onFocus={expandIfNeeded}
            onChange={(event) => onChange({ ...form, body: event.target.value })}
            className={cn(
              "min-h-11 resize-none overflow-hidden rounded-none border-0 bg-transparent px-1 py-0 text-start text-sm leading-relaxed text-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent",
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
          {mode === "edit" && onDelete ? (
            <Button
              type="button"
              variant="delete"
              size="sm"
              onClick={onDelete}
            >
              <Trash2 data-icon="inline-start" />
              {t("common.delete")}
            </Button>
          ) : null}
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
  const { t, direction } = useI18n();

  return (
    <Select value={value || NO_PROJECT} onValueChange={(next) => onChange(next === NO_PROJECT ? "" : next)}>
      <SelectTrigger
        size="sm"
        className="max-w-[14rem] rounded-full border-border bg-transparent px-3 text-xs shadow-none transition-colors hover:bg-accent/50 dark:bg-transparent dark:hover:bg-accent/50"
      >
        <Folder className="size-3.5" aria-hidden />
        <SelectValue placeholder={t("common.noProject")} />
      </SelectTrigger>
      <SelectContent position="popper" align="end" className="min-w-48 rounded-xl">
        <SelectItem value={NO_PROJECT}>
          <span dir={direction}>{t("common.noProject")}</span>
        </SelectItem>
        {projects.map((project) => {
          const projectId = String(project.id);
          const projectNameText = String(project.name ?? "");
          return (
            <SelectItem key={projectId} value={projectId}>
              <span dir={resolveTextDirection(projectNameText, direction)}>{projectNameText}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
