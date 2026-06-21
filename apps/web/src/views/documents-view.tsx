"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateWorkspaceQueryCache,
  peekCachedQuery
} from "../lib/query-cache";
import { dateValue, projectName, truncate } from "../lib/view-models";
import { Drawer, EmptyState, PageHeader, Panel } from "../components/page";
import { Disclosure, CodeBlock } from "../components/disclosure";
import { ConfirmDialog } from "../components/confirm-dialog";
import { useI18n } from "../i18n";
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

type DocumentForm = {
  title: string;
  projectId: string;
  objectKey: string;
  mimeType: string;
  extractedText: string;
};

export default function DocumentsView() {
  const { t, formatDate } = useI18n();
  const [documents, setDocuments] = useState<AnyRecord[]>(
    () => peekCachedQuery<{ documents: AnyRecord[] }>("/api/documents")?.documents ?? []
  );
  const [projects, setProjects] = useState<AnyRecord[]>(
    () => peekCachedQuery<{ projects: AnyRecord[] }>("/api/projects")?.projects ?? []
  );
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

  function closeDrawer() {
    setDrawerOpen(false);
    setForm(blankForm());
  }

  async function create() {
    if (!form.title.trim()) return;
    await apiPost("/api/documents", { ...form, projectId: form.projectId || null });
    closeDrawer();
    invalidateWorkspaceQueryCache();
    await load(true);
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

  return (
    <>
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("documents.title")}
        subtitle={t("documents.subtitle")}
        actions={
          <Button size="sm" type="button" onClick={() => setDrawerOpen(true)}>
            <Plus data-icon="inline-start" />
            {t("documents.newDocument")}
          </Button>
        }
      />

      <Panel title={t("documents.list")}>
        {!documents.length ? (
          <EmptyState title={t("documents.empty")}>{t("documents.subtitle")}</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {documents.map((document) => {
              const hasFile = Boolean(String(document.objectKey ?? document.object_key ?? "").trim());
              return (
                <article
                  key={document.id}
                  className="flex min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-xs"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="truncate text-sm font-semibold text-foreground" dir="auto">
                        {document.title}
                      </p>
                      <p className="line-clamp-3 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]" dir="auto">
                        {truncate(
                          document.extractedText ||
                            document.extracted_text ||
                            t("common.metadataOnly"),
                          160
                        )}
                      </p>
                    </div>
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                      aria-hidden
                    >
                      <FileText className="size-[18px]" />
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {hasFile ? (
                      <>
                        <Button asChild size="sm" variant="outline">
                          <a href={documentFileUrl(document, "inline")} target="_blank" rel="noreferrer">
                            <ExternalLink aria-hidden />
                            {t("documents.openFile")}
                          </a>
                        </Button>
                        <Button asChild size="sm" variant="secondary">
                          <a href={documentFileUrl(document, "attachment")}>
                            <Download aria-hidden />
                            {t("documents.downloadFile")}
                          </a>
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("documents.fileUnavailable")}</span>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="delete"
                      onClick={() => setDeleteTarget(document)}
                    >
                      <Trash2 aria-hidden />
                      {t("common.delete")}
                    </Button>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="max-w-full truncate rounded-full bg-muted px-2 py-0.5">
                      {projectName(projects, String(document.projectId ?? document.project_id ?? "")) ||
                        t("common.noProject")}
                    </span>
                    <span>{formatDate(dateValue(document, "updatedAt"))}</span>
                  </div>
                  <div className="border-t border-border pt-3">
                    <Disclosure label={t("documents.storageDetails")}>
                      <CodeBlock>
                        {JSON.stringify(
                          {
                            objectKey: document.objectKey ?? document.object_key,
                            mimeType: document.mimeType ?? document.mime_type
                          },
                          null,
                          2
                        )}
                      </CodeBlock>
                    </Disclosure>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

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
            <Button type="button" onClick={create} disabled={!form.title.trim()}>
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
                    {project.name}
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
