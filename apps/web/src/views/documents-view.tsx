"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel } from "../components/page";
import { useI18n } from "../i18n";

export default function DocumentsView() {
  const { t, formatDate } = useI18n();
  const [documents, setDocuments] = useState<AnyRecord[]>([]);
  const [projects, setProjects] = useState<AnyRecord[]>([]);
  const [form, setForm] = useState({ title: "", projectId: "", objectKey: "", mimeType: "", extractedText: "" });

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

  async function create() {
    if (!form.title.trim()) return;
    await apiPost("/api/documents", { ...form, projectId: form.projectId || null });
    setForm({ title: "", projectId: "", objectKey: "", mimeType: "", extractedText: "" });
    await load();
  }

  return (
    <>
      <PageHeader title={t("documents.title")} subtitle={t("documents.subtitle")} actions={<button className="button" onClick={load}><RefreshCw size={16} /> {t("common.refresh")}</button>} />
      <div className="grid two">
        <Panel title={t("documents.attachPanel")}>
          <div className="form-grid">
            <input className="input" dir="auto" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t("common.title")} />
            <select className="select" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
              <option value="">{t("common.noProject")}</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <input className="input" dir="ltr" value={form.objectKey} onChange={(event) => setForm({ ...form, objectKey: event.target.value })} placeholder={t("documents.objectKey")} />
            <input className="input" dir="ltr" value={form.mimeType} onChange={(event) => setForm({ ...form, mimeType: event.target.value })} placeholder={t("documents.mimeType")} />
            <textarea className="textarea" dir="auto" value={form.extractedText} onChange={(event) => setForm({ ...form, extractedText: event.target.value })} placeholder={t("documents.extractedText")} />
            <button className="button primary" onClick={create}><Plus size={16} /> {t("common.attach")}</button>
          </div>
        </Panel>
        <Panel title={t("documents.list")}>
          {!documents.length ? <EmptyState>{t("documents.empty")}</EmptyState> : null}
          <div className="row-list">
            {documents.map((document) => (
              <div className="row-item" key={document.id}>
                <div>
                  <p className="row-title" dir="auto">{document.title}</p>
                  <p className="row-meta" dir="auto">{document.objectKey || document.mimeType || t("common.metadataOnly")} - {formatDate(document.updatedAt ?? document.updated_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
