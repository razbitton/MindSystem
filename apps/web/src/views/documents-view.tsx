"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileText, Filter, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateWorkspaceQueryCache,
  peekCachedQuery
} from "../lib/query-cache";
import { findProjectForRecord, projectColorClass, projectColorStyle, projectColorValue } from "../lib/project-colors";
import { dateValue, matchesQuery, projectName, truncate } from "../lib/view-models";
import { Drawer, EmptyState } from "../components/page";
import { Disclosure, CodeBlock } from "../components/disclosure";
import { ConfirmDialog } from "../components/confirm-dialog";
import { useI18n } from "../i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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

const NO_PROJECT = "__none__";
const ANY = "__any__";
const WITH_FILE = "with_file";
const WITHOUT_FILE = "without_file";

type DocumentForm = {
  title: string;
  projectId: string;
  objectKey: string;
  mimeType: string;
  extractedText: string;
};

type DocumentFilters = {
  project_id: string;
  file: string;
};

const defaultDocumentFilters: DocumentFilters = { project_id: "", file: "" };

export default function DocumentsView() {
  const { t, formatDate, direction } = useI18n();
  const [documents, setDocuments] = useState<AnyRecord[]>(
    () => peekCachedQuery<{ documents: AnyRecord[] }>("/api/documents")?.documents ?? []
  );
  const [projects, setProjects] = useState<AnyRecord[]>(
    () => peekCachedQuery<{ projects: AnyRecord[] }>("/api/projects")?.projects ?? []
  );
  const [filters, setFilters] = useState<DocumentFilters>(defaultDocumentFilters);
  const [appliedFilters, setAppliedFilters] = useState<DocumentFilters>(defaultDocumentFilters);
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<DocumentForm>(blankForm());
  const [deleteTarget, setDeleteTarget] = useState<AnyRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load(force = false) {
    const [documentData, projectData] = await Promise.all([
      cachedApiGet<{ documents: AnyRecord[] }>("/api/documents", undefined, { force }),
      cachedApiGet<{ projects: AnyRecord[] }>("/api/projects", undefined, { force })
    ]);
    setDocuments(documentData.documents);
    setProjects(projectData.projects);
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setForm(blankForm());
  }

  async function create() {
    if (!form.title.trim()) return;
    try {
      await apiPost("/api/documents", { ...form, projectId: form.projectId || null });
      closeDrawer();
      invalidateWorkspaceQueryCache();
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    }
  }

  async function resetFilters() {
    setFilters(defaultDocumentFilters);
    setAppliedFilters(defaultDocumentFilters);
    setQuery("");
  }

  function applyFilters() {
    setAppliedFilters(filters);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/documents/${deleteTarget.id}`);
      toast.success(t("documents.deleted"));
      setDeleteTarget(null);
      invalidateWorkspaceQueryCache();
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setDeleting(false);
    }
  }

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => {
      const linkedProjectId = String(document.projectId ?? document.project_id ?? "");
      const documentWithProject = {
        ...document,
        projectName: projectName(projects, linkedProjectId)
      };

      return (
        matchesQuery(documentWithProject, query, [
          "title",
          "extractedText",
          "extracted_text",
          "objectKey",
          "object_key",
          "mimeType",
          "mime_type",
          "projectName"
        ]) && matchesDocumentFilters(document, appliedFilters)
      );
    });
  }, [appliedFilters, documents, projects, query]);

  const hasActiveFilters = Boolean(appliedFilters.project_id || appliedFilters.file || query);

  return (
    <>
      <div className="flex min-w-0 max-w-full flex-col gap-6 pb-10">
        <header className="hidden items-center justify-between gap-6 border-b border-border pb-4 md:flex">
          <h1
            className="min-w-0 text-pretty text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            dir="auto"
          >
            {t("documents.title")}
          </h1>

          <div className="flex min-w-0 items-center gap-3" dir={direction}>
            <Button dir={direction} size="sm" type="button" onClick={openCreate}>
              <Plus data-icon="inline-start" />
              {t("documents.newDocument")}
            </Button>
            <Button
              variant={showFilters ? "secondary" : "ghost"}
              size="icon-sm"
              type="button"
              onClick={() => setShowFilters((current) => !current)}
              aria-label={t("documents.filters")}
              aria-expanded={showFilters}
              className={cn(
                "rounded-lg text-muted-foreground hover:text-foreground",
                showFilters && "text-primary"
              )}
            >
              <Filter className="size-[18px]" aria-hidden />
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
                placeholder={`${t("documents.searchPlaceholder")}...`}
                className={cn(
                  "h-9 rounded-lg border-border bg-secondary/70 ps-10 pe-3 text-sm shadow-none focus-visible:ring-1",
                  direction === "rtl" ? "text-right" : "text-left"
                )}
              />
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 md:hidden">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex h-[58px] shrink-0 items-center justify-start">
                <Button size="sm" type="button" onClick={openCreate}>
                  <Plus data-icon="inline-start" />
                  {t("documents.newDocument")}
                </Button>
              </div>

              <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                <div className="p-2">
                  <div className="relative flex items-center">
                    <Search
                      className="pointer-events-none absolute start-3 size-[18px] text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      dir="auto"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={`${t("documents.searchPlaceholder")}...`}
                      className="h-10 min-w-0 flex-1 border-0 bg-transparent pe-12 ps-10 text-sm shadow-none focus-visible:ring-0"
                    />
                    <Button
                      variant={showFilters ? "secondary" : "ghost"}
                      size="icon-sm"
                      type="button"
                      onClick={() => setShowFilters((current) => !current)}
                      aria-label={t("documents.filters")}
                      aria-expanded={showFilters}
                      className={cn(
                        "ms-1 rounded-lg text-muted-foreground hover:text-foreground",
                        showFilters && "text-primary"
                      )}
                    >
                      <Filter className="size-[18px]" aria-hidden />
                    </Button>
                  </div>
                </div>

                {showFilters ? (
                  <div className="border-t border-border bg-muted/20 p-4">
                    <DocumentFilterPanel
                      filters={filters}
                      projects={projects}
                      onFiltersChange={setFilters}
                      onReset={resetFilters}
                      onApply={applyFilters}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {showFilters ? (
            <div className="hidden rounded-xl border border-border bg-card p-4 shadow-xs md:block">
              <DocumentFilterPanel
                filters={filters}
                projects={projects}
                onFiltersChange={setFilters}
                onReset={resetFilters}
                onApply={applyFilters}
              />
            </div>
          ) : null}

          <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border pb-3">
            <h2 className="text-sm font-medium text-foreground" dir="auto">
              {t("documents.list")}
            </h2>
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
              {filteredDocuments.length} {t("common.results")}
            </Badge>
          </div>

          {!filteredDocuments.length ? (
            <EmptyState title={t("documents.empty")}>
              {hasActiveFilters ? t("common.emptySearch") : t("documents.subtitle")}
            </EmptyState>
          ) : (
            <div className="grid min-w-0 max-w-full gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredDocuments.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  projects={projects}
                  formatDate={formatDate}
                  onDelete={setDeleteTarget}
                />
              ))}

              <button
                type="button"
                onClick={openCreate}
                className="interactive-card group flex min-h-[17rem] min-w-0 max-w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/40 p-6 text-center text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted transition-[background-color,transform] group-hover:scale-105 group-hover:bg-primary/10">
                  <Plus className="size-7" aria-hidden />
                </span>
                <span className="text-base font-semibold">{t("documents.newDocument")}</span>
                <span className="mt-2 max-w-56 text-sm leading-relaxed text-muted-foreground">
                  {t("documents.subtitle")}
                </span>
              </button>
            </div>
          )}
        </section>

        <Drawer
          open={drawerOpen}
          title={t("documents.newDocument")}
          subtitle={t("documents.subtitle")}
          onClose={closeDrawer}
          footer={
            <>
              <Button variant="outline" type="button" onClick={closeDrawer}>
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={() => void create()} disabled={!form.title.trim()}>
                {t("common.attach")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="document-title">{t("common.title")}</Label>
              <Input
                id="document-title"
                dir="auto"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="document-project">{t("common.project")}</Label>
              <Select
                value={form.projectId || NO_PROJECT}
                onValueChange={(value) => setForm({ ...form, projectId: value === NO_PROJECT ? "" : value })}
              >
                <SelectTrigger id="document-project" className="w-full">
                  <SelectValue placeholder={t("common.noProject")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>{t("common.noProject")}</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      <span className="inline-flex min-w-0 items-center gap-2">
                        {projectColorValue(project.color) ? (
                          <span
                            className={cn("size-2.5 shrink-0 rounded-full", projectColorClass(project.color, "swatch"))}
                            style={projectColorStyle(project.color)}
                            aria-hidden
                          />
                        ) : null}
                        <span className="truncate" dir="auto">
                          {project.name}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="document-text">{t("documents.extractedText")}</Label>
              <Textarea
                id="document-text"
                dir="auto"
                rows={5}
                value={form.extractedText}
                onChange={(event) => setForm({ ...form, extractedText: event.target.value })}
              />
            </div>
            <Disclosure label={t("documents.storageDetails")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="document-object-key">{t("documents.objectKey")}</Label>
                  <Input
                    id="document-object-key"
                    dir="ltr"
                    value={form.objectKey}
                    onChange={(event) => setForm({ ...form, objectKey: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="document-mime">{t("documents.mimeType")}</Label>
                  <Input
                    id="document-mime"
                    dir="ltr"
                    value={form.mimeType}
                    onChange={(event) => setForm({ ...form, mimeType: event.target.value })}
                  />
                </div>
              </div>
            </Disclosure>
          </div>
        </Drawer>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => (!next ? setDeleteTarget(null) : undefined)}
        title={t("documents.deleteDocument")}
        description={t("documents.deleteConfirm", { title: deleteTarget?.title ?? "" })}
        confirmLabel={t("common.delete")}
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function DocumentFilterPanel({
  filters,
  projects,
  onFiltersChange,
  onReset,
  onApply
}: {
  filters: DocumentFilters;
  projects: AnyRecord[];
  onFiltersChange: (filters: DocumentFilters) => void;
  onReset: () => void | Promise<void>;
  onApply: () => void | Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
      <Select
        value={filters.project_id || ANY}
        onValueChange={(value) => onFiltersChange({ ...filters, project_id: value === ANY ? "" : value })}
      >
        <SelectTrigger className="w-full min-w-0 rounded-xl bg-background/70">
          <SelectValue placeholder={t("tasks.anyProject")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("tasks.anyProject")}</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={String(project.id)}>
              <span className="inline-flex min-w-0 items-center gap-2">
                {projectColorValue(project.color) ? (
                  <span
                    className={cn("size-2.5 shrink-0 rounded-full", projectColorClass(project.color, "swatch"))}
                    style={projectColorStyle(project.color)}
                    aria-hidden
                  />
                ) : null}
                <span className="truncate" dir="auto">
                  {project.name}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.file || ANY}
        onValueChange={(value) => onFiltersChange({ ...filters, file: value === ANY ? "" : value })}
      >
        <SelectTrigger className="w-full min-w-0 rounded-xl bg-background/70">
          <SelectValue placeholder={t("documents.anyFile")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("documents.anyFile")}</SelectItem>
          <SelectItem value={WITH_FILE}>{t("documents.withFile")}</SelectItem>
          <SelectItem value={WITHOUT_FILE}>{t("documents.withoutFile")}</SelectItem>
        </SelectContent>
      </Select>

      <div className="grid grid-cols-2 gap-3 md:flex md:justify-end">
        <Button variant="ghost" size="sm" type="button" onClick={() => void onReset()} className="rounded-xl">
          {t("common.reset")}
        </Button>
        <Button variant="outline" size="sm" type="button" onClick={() => void onApply()} className="rounded-xl">
          {t("common.apply")}
        </Button>
      </div>
    </div>
  );
}

function DocumentCard({
  document,
  projects,
  formatDate,
  onDelete
}: {
  document: AnyRecord;
  projects: AnyRecord[];
  formatDate: (value?: string | null) => string;
  onDelete: (document: AnyRecord) => void;
}) {
  const { t } = useI18n();
  const objectKey = String(document.objectKey ?? document.object_key ?? "").trim();
  const mimeType = String(document.mimeType ?? document.mime_type ?? "").trim();
  const hasFile = Boolean(objectKey);
  const linkedProjectRecord = findProjectForRecord(projects, document);
  const linkedProject = linkedProjectRecord?.name ?? projectName(projects, String(document.projectId ?? document.project_id ?? ""));
  const summary = truncate(
    document.extractedText ||
      document.extracted_text ||
      objectKey ||
      t("common.metadataOnly"),
    220
  );

  return (
    <article
      className={cn(
        "interactive-card group flex h-full min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card p-4",
        projectColorClass(linkedProjectRecord?.color, "card")
      )}
      style={projectColorStyle(linkedProjectRecord?.color)}
    >
      <div className="mb-3 flex min-w-0 items-start gap-4">
        <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-[background-color,transform] group-hover:scale-105 group-hover:bg-primary/15" aria-hidden>
          <FileText className="size-6" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold leading-tight text-foreground" title={String(document.title ?? "")} dir="auto">
            {document.title}
          </h3>
          <p className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDate(dateValue(document, "updatedAt"))}</span>
            {mimeType ? (
              <>
                <span className="size-1 rounded-full bg-muted-foreground/40" aria-hidden />
                <span className="truncate">{documentFileType(mimeType, objectKey)}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="mb-5 min-h-[4.75rem] flex-1">
        <p className="line-clamp-4 break-words text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]" dir="auto">
          {summary}
        </p>
      </div>

      <div className="mt-auto">
        <div className="mb-4 flex items-center justify-between gap-3">
          {hasFile ? (
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
              <Button asChild size="sm" className="min-w-0 flex-1 sm:flex-none">
                <a href={documentFileUrl(document, "inline")} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                  {t("documents.openFile")}
                </a>
              </Button>
              <Button asChild size="sm" variant="secondary" className="min-w-0 flex-1 sm:flex-none">
                <a href={documentFileUrl(document, "attachment")}>
                  <Download aria-hidden />
                  {t("documents.downloadFile")}
                </a>
              </Button>
            </div>
          ) : (
            <Badge variant="outline" className="rounded-md px-2 py-1 text-xs text-muted-foreground">
              {t("documents.fileUnavailable")}
            </Badge>
          )}

          <Button
            type="button"
            size="icon-sm"
            variant="delete"
            onClick={() => onDelete(document)}
            title={t("common.delete")}
            aria-label={t("common.delete")}
            className="shrink-0"
          >
            <Trash2 className="size-[18px]" aria-hidden />
          </Button>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
            <Badge
              variant="secondary"
              className={cn(
                "min-w-0 max-w-[70%] rounded-md bg-secondary/80 px-2.5 py-1 text-xs",
                projectColorClass(linkedProjectRecord?.color, "badge")
              )}
              style={projectColorStyle(linkedProjectRecord?.color)}
            >
              {projectColorValue(linkedProjectRecord?.color) ? (
                <span
                  className={cn("size-2 shrink-0 rounded-full", projectColorClass(linkedProjectRecord?.color, "swatch"))}
                  style={projectColorStyle(linkedProjectRecord?.color)}
                  aria-hidden
                />
              ) : null}
              <span className="truncate" dir="auto">
                {linkedProject || t("common.noProject")}
              </span>
            </Badge>

            <Disclosure label={t("documents.storageDetails")} className="w-auto shrink-0 text-end">
              <CodeBlock>
                {JSON.stringify(
                  {
                    objectKey: objectKey || null,
                    mimeType: mimeType || null
                  },
                  null,
                  2
                )}
              </CodeBlock>
            </Disclosure>
          </div>
        </div>
      </div>
    </article>
  );
}

function matchesDocumentFilters(document: AnyRecord, filters: DocumentFilters) {
  const projectId = String(document.projectId ?? document.project_id ?? "");
  const hasFile = Boolean(String(document.objectKey ?? document.object_key ?? "").trim());

  if (filters.project_id && projectId !== filters.project_id) return false;
  if (filters.file === WITH_FILE && !hasFile) return false;
  if (filters.file === WITHOUT_FILE && hasFile) return false;
  return true;
}

function blankForm(): DocumentForm {
  return {
    title: "",
    projectId: "",
    objectKey: "",
    mimeType: "",
    extractedText: ""
  };
}

function documentFileUrl(document: AnyRecord, disposition: "inline" | "attachment") {
  return `/api/documents/${encodeURIComponent(String(document.id))}/download?disposition=${disposition}`;
}

function documentFileType(mimeType: string, objectKey: string) {
  if (mimeType) return mimeType.split(";")[0] || mimeType;
  const extension = objectKey.split(".").at(-1);
  return extension && extension !== objectKey ? extension.toUpperCase() : "";
}
