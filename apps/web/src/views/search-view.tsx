"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { apiGet, type AnyRecord } from "../lib/api";
import { dateValue, truncate } from "../lib/view-models";
import { EmptyState, EntityBadge, PageHeader, Panel, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";

const entityTypes = ["project", "task", "note", "document", "reminder", "decision", "person", "goal"] as const;

export default function SearchView() {
  const { t, formatDate, translateValue } = useI18n();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState({ q: "", entity_type: "", status: "" });
  const [results, setResults] = useState<AnyRecord[]>([]);
  const [mode, setMode] = useState<string>("");
  const [searched, setSearched] = useState(false);

  async function runSearch(nextFilters = filters) {
    const data = await apiGet<{ results: AnyRecord[]; retrieval: AnyRecord }>("/api/search", nextFilters);
    setResults(data.results);
    setMode(data.retrieval?.mode ?? "");
    setSearched(true);
  }

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (!q) return;
    const nextFilters = { q, entity_type: "", status: "" };
    setFilters(nextFilters);
    void runSearch(nextFilters);
  }, [searchParams]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch();
  }

  return (
    <>
      <PageHeader title={t("search.title")} subtitle={t("search.subtitle")} />
      <Panel>
        <form className="grid" onSubmit={submit}>
          <div className="search-hero">
            <input
              className="input"
              dir="auto"
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
              placeholder={t("search.placeholder")}
              aria-label={t("search.placeholder")}
            />
            <button className="button primary" type="submit">
              <Search size={16} aria-hidden /> {t("common.search")}
            </button>
          </div>
          <div className="filter-bar">
            <button
              className={!filters.entity_type ? "badge info" : "badge"}
              type="button"
              onClick={() => setFilters({ ...filters, entity_type: "" })}
            >
              {t("search.allEntities")}
            </button>
            {entityTypes.map((type) => (
              <button
                key={type}
                className={filters.entity_type === type ? `badge entity-${type}` : "badge"}
                type="button"
                onClick={() => setFilters({ ...filters, entity_type: type })}
              >
                {translateValue("entity", type)}
              </button>
            ))}
            <input className="input" dir="auto" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} placeholder={t("common.status")} style={{ maxWidth: 180 }} />
          </div>
        </form>
      </Panel>

      <div className="grid" style={{ marginTop: 16 }}>
        <div className="toolbar space-between">
          <h2 className="panel-title">{t("common.results")}</h2>
          {mode ? <span className="badge info">{t("search.retrievalMode", { mode })}</span> : null}
        </div>
        {!results.length ? <EmptyState title={searched ? t("search.empty") : t("common.search")}>{searched ? t("common.emptySearch") : t("search.subtitle")}</EmptyState> : null}
        <div className="cards-grid">
          {results.map((result) => (
            <article className="item-card" key={result.id}>
              <div className="item-card-header">
                <div>
                  <p className="item-card-title" dir="auto">{result.title}</p>
                  <p className="item-card-body" dir="auto">{truncate(result.summary || result.body || t("search.noSummary"), 220)}</p>
                </div>
                <EntityBadge value={result.entity_type ?? result.entityType} />
              </div>
              <div className="item-card-meta">
                <StatusBadge value={result.status} />
                <span>{formatDate(dateValue(result, "updatedAt"))}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
