"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { apiGet, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";

const entityTypes = ["project", "task", "note", "document", "reminder", "decision", "person", "goal"] as const;

export default function SearchView() {
  const { t, formatDate, translateValue } = useI18n();
  const [filters, setFilters] = useState({ q: "", entity_type: "", status: "" });
  const [results, setResults] = useState<AnyRecord[]>([]);
  const [mode, setMode] = useState<string>("");

  async function search() {
    const data = await apiGet<{ results: AnyRecord[]; retrieval: AnyRecord }>("/api/search", filters);
    setResults(data.results);
    setMode(data.retrieval.mode);
  }

  return (
    <>
      <PageHeader title={t("search.title")} subtitle={t("search.subtitle")} />
      <Panel title={t("common.query")}>
        <div className="toolbar">
          <input className="input" dir="auto" style={{ maxWidth: 420 }} value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder={t("search.placeholder")} />
          <select className="select" style={{ maxWidth: 180 }} value={filters.entity_type} onChange={(event) => setFilters({ ...filters, entity_type: event.target.value })}>
            <option value="">{t("search.anyType")}</option>
            {entityTypes.map((type) => <option key={type} value={type}>{translateValue("entity", type)}</option>)}
          </select>
          <input className="input" dir="auto" style={{ maxWidth: 180 }} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} placeholder={t("common.status")} />
          <button className="button primary" onClick={search}><Search size={16} /> {t("common.search")}</button>
        </div>
      </Panel>
      <div style={{ marginTop: 14 }}>
        <Panel title={`${t("common.results")}${mode ? ` - ${mode}` : ""}`}>
          {!results.length ? <EmptyState>{t("search.empty")}</EmptyState> : null}
          <div className="row-list">
            {results.map((result) => (
              <div className="row-item" key={result.id}>
                <div>
                  <p className="row-title" dir="auto">{result.title}</p>
                  <p className="row-meta" dir="auto">{result.summary || result.body || t("search.noSummary")} - {formatDate(result.updated_at ?? result.updatedAt)}</p>
                </div>
                <div className="toolbar">
                  <span className="badge">{translateValue("entity", result.entity_type ?? result.entityType)}</span>
                  <StatusBadge value={result.status} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
