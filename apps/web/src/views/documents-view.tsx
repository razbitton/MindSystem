"use client";

import { useEffect, useState } from "react";
import { FileText, Plus, RefreshCw } from "lucide-react";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { dateValue, projectName, truncate } from "../lib/view-models";
import { Drawer, EmptyState, PageHeader, Panel } from "../components/page";
import { useI18n } from "../i18n";

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
    <>
      <PageHeader
        title={t("documents.title")}
        subtitle={t("documents.subtitle")}
        actions={
          <>
            <button className="button" type="button" onClick={load}>
              <RefreshCw size={16} aria-hidden /> {t("common.refresh")}
            </button>
            <button className="button primary" type="button" onClick={() => setDrawerOpen(true)}>
              <Plus size={16} aria-hidden /> {t("documents.newDocument")}
            </button>
          </>
        }
      />
      <Panel title={t("documents.list")}>
        {!documents.length ? <EmptyState title={t("documents.empty")}>{t("documents.subtitle")}</EmptyState> : null}
        <div className="cards-grid">
          {documents.map((document) => (
            <article className="item-card" key={document.id}>
              <div className="item-card-header">
                <div>
                  <p className="item-card-title" dir="auto">{document.title}</p>
                  <p className="item-card-body" dir="auto">{truncate(document.extractedText || document.extracted_text || document.objectKey || document.mimeType || t("common.metadataOnly"), 180)}</p>
                </div>
                <FileText size={18} aria-hidden />
              </div>
              <div className="item-card-meta">
                <span>{projectName(projects, String(document.projectId ?? document.project_id ?? "")) || t("common.noProject")}</span>
                <span>{formatDate(dateValue(document, "updatedAt"))}</span>
              </div>
              <details className="advanced-details">
                <summary>{t("documents.storageDetails")}</summary>
                <pre className="code">{JSON.stringify({ objectKey: document.objectKey ?? document.object_key, mimeType: document.mimeType ?? document.mime_type }, null, 2)}</pre>
              </details>
            </article>
          ))}
        </div>
      </Panel>

      <Drawer
        open={drawerOpen}
        title={t("documents.newDocument")}
        subtitle={t("documents.subtitle")}
        onClose={closeDrawer}
        footer={
          <>
            <button className="button" type="button" onClick={closeDrawer}>{t("common.cancel")}</button>
            <button className="button primary" type="button" onClick={create} disabled={!form.title.trim()}>{t("common.attach")}</button>
          </>
        }
      >
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="document-title">{t("common.title")}</label>
            <input id="document-title" className="input" dir="auto" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </div>
          <div className="form-row">
            <label htmlFor="document-project">{t("common.project")}</label>
            <select id="document-project" className="select" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
              <option value="">{t("common.noProject")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          <div className="grid two">
            <div className="form-row">
              <label htmlFor="document-object-key">{t("documents.objectKey")}</label>
              <input id="document-object-key" className="input" dir="ltr" value={form.objectKey} onChange={(event) => setForm({ ...form, objectKey: event.target.value })} />
            </div>
            <div className="form-row">
              <label htmlFor="document-mime">{t("documents.mimeType")}</label>
              <input id="document-mime" className="input" dir="ltr" value={form.mimeType} onChange={(event) => setForm({ ...form, mimeType: event.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="document-text">{t("documents.extractedText")}</label>
            <textarea id="document-text" className="textarea" dir="auto" value={form.extractedText} onChange={(event) => setForm({ ...form, extractedText: event.target.value })} />
          </div>
        </div>
      </Drawer>
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
