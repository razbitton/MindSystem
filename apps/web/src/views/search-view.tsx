"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { apiGet, type AnyRecord } from "../lib/api";
import { dateValue, truncate } from "../lib/view-models";
import { EmptyState, EntityBadge, PageHeader, StatusBadge } from "../components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useI18n } from "../i18n";

const entityTypes = ["project", "task", "note", "document", "reminder", "decision", "person", "goal"] as const;

export default function SearchView() {
  const { t, formatDate, translateValue } = useI18n();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState({ q: "", entity_type: "", status: "" });
  const [results, setResults] = useState<AnyRecord[]>([]);
  const [mode, setMode] = useState<string>("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  async function runSearch(nextFilters = filters) {
    setLoading(true);
    try {
      const data = await apiGet<{ results: AnyRecord[]; retrieval: AnyRecord }>("/api/search", nextFilters);
      setResults(data.results);
      setMode(data.retrieval?.mode ?? "");
      setSearched(true);
    } finally {
      setLoading(false);
    }
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

      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              size={18}
              aria-hidden
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              dir="auto"
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
              placeholder={t("search.placeholder")}
              aria-label={t("search.placeholder")}
              className="h-11 ps-10 text-base"
              autoFocus
            />
          </div>
          <Button type="submit" size="lg" disabled={loading}>
            <Search aria-hidden /> {t("common.search")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            active={!filters.entity_type}
            onClick={() => setFilters({ ...filters, entity_type: "" })}
          >
            {t("search.allEntities")}
          </FilterChip>
          {entityTypes.map((type) => (
            <FilterChip
              key={type}
              active={filters.entity_type === type}
              onClick={() => setFilters({ ...filters, entity_type: type })}
            >
              {translateValue("entity", type)}
            </FilterChip>
          ))}
        </div>
      </form>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">{t("common.results")}</h2>
        {mode ? (
          <span className="text-xs text-muted-foreground">{t("search.retrievalMode", { mode })}</span>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : !results.length ? (
        <div className="mt-4">
          <EmptyState title={searched ? t("search.empty") : t("common.search")}>
            {searched ? t("common.emptySearch") : t("search.subtitle")}
          </EmptyState>
        </div>
      ) : (
        <div className="bounded-scroll mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [max-block-size:min(64rem,calc(100svh_-_10rem))]">
          {results.map((result) => (
            <article
              key={result.id}
              className="bounded-scroll flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-foreground/20 [max-block-size:min(36rem,calc(100svh_-_10rem))]"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug text-foreground" dir="auto">
                  {result.title}
                </p>
                <EntityBadge value={result.entity_type ?? result.entityType} />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground" dir="auto">
                {truncate(result.summary || result.body || t("search.noSummary"), 200)}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <StatusBadge value={result.status} />
                <span className="text-xs text-muted-foreground">
                  {formatDate(dateValue(result, "updatedAt"))}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
