"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Edit3, FolderKanban, Plus, RefreshCw, Search } from "lucide-react";
import { apiGet, apiPatch, apiPost, type AnyRecord } from "../lib/api";
import { dateValue, fromDateTimeInput, matchesQuery, toDateTimeInput, truncate } from "../lib/view-models";
import { Drawer, EmptyState, IconButton, PageHeader, Panel, PriorityBadge, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";
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

  const filteredProjects = useMemo(
    () => projects.filter((project) => matchesQuery(project, query, ["name", "description", "goal", "status", "priority"])),
    [projects, query]
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("projects.title")}
        subtitle={t("projects.subtitle")}
        actions={
          <>
            <Button variant="outline" size="sm" type="button" onClick={load}>
              <RefreshCw data-icon="inline-start" />
              {t("common.refresh")}
            </Button>
            <Button size="sm" type="button" onClick={openCreate}>
              <Plus data-icon="inline-start" />
              {t("projects.newProject")}
            </Button>
          </>
        }
      />

      <Panel>
        <div className="flex flex-col gap-4">
          <div className="relative max-w-md">
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProjects.map((project) => (
                <article
                  key={project.id}
                  className="bounded-scroll flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md [max-block-size:min(36rem,calc(100svh_-_10rem))]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/projects/${project.id}`}
                      className="min-w-0 hover:underline"
                      aria-label={`${t("projects.openProject")}: ${project.name}`}
                    >
                      <p className="truncate text-sm font-semibold text-foreground" dir="auto">
                        {project.name}
                      </p>
                    </Link>
                    <IconButton label={t("common.edit")} onClick={() => openEdit(project)}>
                      <Edit3 className="size-4" aria-hidden />
                    </IconButton>
                  </div>
                  <p className="line-clamp-3 text-sm text-muted-foreground" dir="auto">
                    {truncate(project.description || project.goal, 180) || t("common.noDescription")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <PriorityBadge value={project.priority} />
                    <StatusBadge value={project.status} />
                    <span>{formatDate(dateValue(project, "updatedAt"))}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <FolderKanban className="size-[15px] shrink-0" aria-hidden />
                      <strong className="truncate font-medium text-foreground" dir="auto">
                        {project.goal || t("projects.noGoal")}
                      </strong>
                    </span>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/projects/${project.id}`}>{t("common.open")}</Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Drawer
        open={drawerOpen}
        title={editingProject ? t("projects.editProject") : t("projects.newProject")}
        subtitle={editingProject ? formatDate(dateValue(editingProject, "updatedAt")) : t("projects.subtitle")}
        onClose={closeDrawer}
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeDrawer}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={save} disabled={!form.name.trim()}>
              {t("common.save")}
            </Button>
          </>
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
    </div>
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
