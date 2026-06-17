"use client";

import { useEffect, useState } from "react";
import { FileText, Plus, RefreshCw } from "lucide-react";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { dateValue, projectName, truncate } from "../lib/view-models";
import { Drawer, EmptyState, PageHeader, Panel } from "../components/page";
import { Disclosure, CodeBlock } from "../components/disclosure";
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
  const [documents, setDocuments] = useState<AnyRecord[]>([]);
  const [projects, setProjects] = useState<AnyRecord[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<DocumentForm>(blankForm());

  async function load() {
    const [documentData, projectData] = await Promise.all([
      apiGet<{ documents: AnyRecord[] }>("/api/documents"),
      apiGet<{ projects: AnyRecord[] }>("/api/projects")
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
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("documents.title")}
        subtitle={t("documents.subtitle")}
        actions={
          <>
            <Button variant="outline" size="sm" type="button" onClick={load}>
              <RefreshCw data-icon="inline-start" />
              {t("common.refresh")}
            </Button>
            <Button size="sm" type="button" onClick={() => setDrawerOpen(true)}>
              <Plus data-icon="inline-start" />
              {t("documents.newDocument")}
            </Button>
          </>
        }
      />

      <Panel title={t("documents.list")}>
        {!documents.length ? (
          <EmptyState title={t("documents.empty")}>{t("documents.subtitle")}</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {documents.map((document) => (
              <article
                key={document.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate text-sm font-semibold text-foreground" dir="auto">
                      {document.title}
                    </p>
                    <p className="line-clamp-3 text-sm text-muted-foreground" dir="auto">
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
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5">
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
            ))}
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
