"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Edit2, FolderKanban, Plus, Search, Trash2 } from "lucide-react";
import { apiDelete, apiPatch, apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateWorkspaceQueryCache,
  peekCachedQuery
} from "../lib/query-cache";
import { dateValue, fromDateTimeInput, matchesQuery, sortByPriority, toDateTimeInput, truncate } from "../lib/view-models";
import {
  projectColorClass,
  projectColorStyle,
  projectColorValue
} from "../lib/project-colors";
import { Drawer, EmptyState, IconButton, PageHeader, PriorityBadge, StatusBadge } from "../components/page";
import { ConfirmDialog } from "../components/confirm-dialog";
import { useI18n } from "../i18n";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";

const priorities = ["low", "medium", "high", "urgent"] as const;
const statuses = ["active", "paused", "completed", "archived"] as const;
const solidProjectColors = [
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#111827",
  "#9CA3AF"
] as const;
const normalizedSolidProjectColors = new Set(solidProjectColors.map((color) => color.toLowerCase()));

type ProjectForm = {
  name: string;
  description: string;
  goal: string;
  color: string;
  status: string;
  priority: string;
  dueAt: string;
};

export default function ProjectsView() {
  const { t, formatDate, translateValue, direction } = useI18n();
  const [projects, setProjects] = useState<AnyRecord[]>(
    () => peekCachedQuery<{ projects: AnyRecord[] }>("/api/projects")?.projects ?? []
  );
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<AnyRecord | null>(null);
  const [form, setForm] = useState<ProjectForm>(blankForm());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnyRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load(force = false) {
    setError(null);
    try {
      const data = await cachedApiGet<{ projects: AnyRecord[] }>("/api/projects", undefined, { force });
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
      color: String(project.color ?? ""),
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
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        goal: form.goal || undefined,
        color: form.color || null,
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
      invalidateWorkspaceQueryCache();
      await load(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
    } finally {
      setSaving(false);
    }
  }

  function requestDelete(project: AnyRecord, event?: { stopPropagation: () => void }) {
    event?.stopPropagation();
    setDeleteTarget(project);
  }

  async function deleteSelectedProject() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/projects/${deleteTarget.id}`);
      if (editingProject?.id === deleteTarget.id) closeDrawer();
      setDeleteTarget(null);
      invalidateWorkspaceQueryCache();
      await load(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
    } finally {
      setDeleting(false);
    }
  }

  const filteredProjects = useMemo(
    () => sortByPriority(projects.filter((project) => matchesQuery(project, query, ["name", "description", "goal", "status", "priority", "color"]))),
    [projects, query]
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="hidden items-center justify-between gap-6 border-b border-border pb-4 md:flex">
        <h1
          className="min-w-0 text-pretty text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
          dir="auto"
        >
          {t("projects.title")}
        </h1>

        <div className="flex min-w-0 items-center gap-3" dir={direction}>
          <Button dir={direction} size="sm" type="button" onClick={openCreate}>
            <Plus data-icon="inline-start" />
            {t("projects.newProject")}
          </Button>
          <div className="relative w-72 min-w-0">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              dir={direction}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`${t("projects.searchPlaceholder")}...`}
              className={cn(
                "h-9 rounded-lg border-border bg-secondary/70 ps-10 pe-3 text-sm shadow-none focus-visible:ring-1",
                direction === "rtl" ? "text-right" : "text-left"
              )}
            />
          </div>
        </div>
      </header>

      <div className="md:hidden">
        <PageHeader
          title={t("projects.title")}
          subtitle={t("projects.subtitle")}
          actions={
            <Button size="sm" type="button" onClick={openCreate}>
              <Plus data-icon="inline-start" />
              {t("projects.newProject")}
            </Button>
          }
        />
      </div>

      <section className="flex min-w-0 max-w-full flex-col gap-4 overflow-visible">
          <div className="relative w-full max-w-md md:hidden">
            <Search
              className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              dir="auto"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("projects.searchPlaceholder")}
              className="ps-9"
            />
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {!filteredProjects.length && !error ? (
            <EmptyState title={t("projects.empty")}>{t("common.emptySearch")}</EmptyState>
          ) : (
            <div className="grid min-w-0 max-w-full gap-4 pt-1 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project) => (
                <article
                  key={project.id}
                  className={cn(
                    "interactive-card group flex min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4",
                    projectColorClass(project.color, "card")
                  )}
                  style={projectColorStyle(project.color)}
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <Link
                      href={`/projects/${project.id}`}
                      className="min-w-0 flex-1 overflow-hidden transition-colors hover:text-primary"
                      aria-label={`${t("projects.openProject")}: ${project.name}`}
                    >
                      <p className="truncate text-sm font-semibold text-current [overflow-wrap:anywhere]" dir="auto">
                        {projectColorValue(project.color) ? (
                          <span
                            className={cn("me-2 inline-block size-2.5 rounded-full align-middle", projectColorClass(project.color, "swatch"))}
                            style={projectColorStyle(project.color)}
                            aria-hidden
                          />
                        ) : null}
                        {project.name}
                      </p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton label={t("common.edit")} action="edit" onClick={() => openEdit(project)}>
                        <Edit2 className="size-[18px]" aria-hidden />
                      </IconButton>
                      <IconButton
                        label={t("common.delete")}
                        action="delete"
                        onClick={(event) => requestDelete(project, event)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </IconButton>
                    </div>
                  </div>
                  <p className="line-clamp-3 max-w-full break-words text-start text-sm text-muted-foreground [overflow-wrap:anywhere]" dir="auto">
                    {truncate(project.description || project.goal, 180) || t("common.noDescription")}
                  </p>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <PriorityBadge value={project.priority} />
                    <StatusBadge value={project.status} />
                    <span>{formatDate(dateValue(project, "updatedAt"))}</span>
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-2 border-t border-border pt-3">
                    <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
                      <FolderKanban
                        className={cn("size-[15px] shrink-0", projectColorClass(project.color, "text"))}
                        style={projectColorStyle(project.color)}
                        aria-hidden
                      />
                      <strong className="min-w-0 truncate font-medium text-foreground [overflow-wrap:anywhere]" dir="auto">
                        {project.goal || t("projects.noGoal")}
                      </strong>
                    </span>
                    <Button asChild variant="ghost" size="sm" className="shrink-0">
                      <Link href={`/projects/${project.id}`}>{t("common.open")}</Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
      </section>

      <Drawer
        open={drawerOpen}
        title={editingProject ? t("projects.editProject") : t("projects.newProject")}
        subtitle={editingProject ? formatDate(dateValue(editingProject, "updatedAt")) : t("projects.subtitle")}
        onClose={closeDrawer}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {editingProject ? (
                <Button
                  type="button"
                  variant="delete"
                  onClick={() => requestDelete(editingProject)}
                >
                  <Trash2 data-icon="inline-start" />
                  {t("common.delete")}
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" type="button" onClick={closeDrawer}>
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={() => void save()} disabled={!form.name.trim() || saving}>
                {t("common.save")}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">{t("common.title")}</Label>
            <Input
              id="project-name"
              dir="auto"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-description">{t("common.description")}</Label>
            <Textarea
              id="project-description"
              dir="auto"
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-goal">{t("projects.goal")}</Label>
            <Textarea
              id="project-goal"
              dir="auto"
              rows={3}
              value={form.goal}
              onChange={(event) => setForm({ ...form, goal: event.target.value })}
            />
          </div>
          <ProjectColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-status">{t("common.status")}</Label>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                <SelectTrigger id="project-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {translateValue("status", status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-priority">{t("common.priority")}</Label>
              <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}>
                <SelectTrigger id="project-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {translateValue("priority", priority)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-due">{t("common.due")}</Label>
            <Input
              id="project-due"
              type="datetime-local"
              value={form.dueAt}
              onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
            />
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("projects.deleteProject")}
        description={t("projects.deleteConfirm", {
          title: String(deleteTarget?.name || t("entity.project"))
        })}
        confirmLabel={deleting ? t("common.deleting") : t("common.delete")}
        destructive
        loading={deleting}
        onConfirm={() => void deleteSelectedProject()}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function blankForm(): ProjectForm {
  return {
    name: "",
    description: "",
    goal: "",
    color: "",
    status: "active",
    priority: "medium",
    dueAt: ""
  };
}

function ProjectColorPicker({
  value,
  onChange
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const { t } = useI18n();
  const customColorInputId = useId();
  const selectedColor = projectColorValue(value);
  const customColorValue = selectedColor ?? "#3b82f6";
  const customColorSelected = Boolean(selectedColor && !normalizedSolidProjectColors.has(selectedColor));

  return (
    <div className="flex flex-col gap-2">
      <Label>{t("projects.color")}</Label>
      <div
        className="flex min-w-0 flex-wrap items-center gap-2"
        role="radiogroup"
        aria-label={t("projects.color")}
      >
        {solidProjectColors.map((color) => {
          const normalizedColor = color.toLowerCase();
          const isSelected = selectedColor === normalizedColor;

          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(color)}
              title={color}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-background shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
              )}
              style={{ backgroundColor: color }}
            >
              {isSelected ? (
                <Check
                  className={cn("size-5", isLightProjectColor(normalizedColor) ? "text-slate-950" : "text-white")}
                  strokeWidth={3}
                  aria-hidden
                />
              ) : null}
              <span className="sr-only">{color}</span>
            </button>
          );
        })}
        <label
          htmlFor={customColorInputId}
          title={customColorValue.toUpperCase()}
          className={cn(
            "relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-background shadow-sm transition-transform hover:scale-105",
            customColorSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
          )}
          style={{
            background: "conic-gradient(from 0deg, #ef4444, #f59e0b, #84cc16, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)"
          }}
        >
          <input
            id={customColorInputId}
            type="color"
            value={customColorValue}
            onChange={(event) => onChange(event.target.value)}
            className="peer sr-only"
            aria-label={t("projects.color")}
          />
          <span
            className="flex size-6 items-center justify-center rounded-full border border-white/70 bg-background text-foreground shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background"
            style={customColorSelected ? { backgroundColor: customColorValue } : undefined}
            aria-hidden
          >
            {customColorSelected ? (
              <Check
                className={cn("size-4", isLightProjectColor(customColorValue) ? "text-slate-950" : "text-white")}
                strokeWidth={3}
              />
            ) : (
              <Plus className="size-4" strokeWidth={2.5} />
            )}
          </span>
        </label>
        <button
          type="button"
          aria-pressed={!selectedColor}
          onClick={() => onChange("")}
          className={cn(
            "flex h-9 min-w-0 items-center gap-2 rounded-lg border border-border bg-background/70 px-3 text-start text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !selectedColor && "border-primary text-primary"
          )}
        >
          <span className="size-4 rounded-full border border-border bg-background" aria-hidden />
          <span className="truncate">{t("projectColor.none")}</span>
        </button>
      </div>
    </div>
  );
}

function isLightProjectColor(color: string) {
  const normalizedColor = projectColorValue(color);
  if (!normalizedColor) return false;

  const red = parseInt(normalizedColor.slice(1, 3), 16);
  const green = parseInt(normalizedColor.slice(3, 5), 16);
  const blue = parseInt(normalizedColor.slice(5, 7), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 155;
}
