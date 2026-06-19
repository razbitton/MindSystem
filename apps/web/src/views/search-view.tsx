"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, type AnyRecord } from "../lib/api";
import { cachedApiGet, invalidateWorkspaceQueryCache, peekCachedQuery } from "../lib/query-cache";
import { dateValue, truncate } from "../lib/view-models";
import { EmptyState, EntityBadge, PageHeader, StatusBadge } from "../components/page";
import { ConfirmDialog } from "../components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useI18n } from "../i18n";

const entityTypes = ["project", "task", "note", "document", "reminder", "decision", "person", "goal"] as const;

export default function SearchView() {
  const { t, formatDate, translateValue } = useI18n();
  const searchParams = useSearchParams();
  const initialFilters = { q: searchParams.get("q") ?? "", entity_type: "", status: "" };
  const cachedSearch = initialFilters.q
    ? peekCachedQuery<{ results: AnyRecord[]; retrieval: AnyRecord }>("/api/search", initialFilters)
    : undefined;
  const [filters, setFilters] = useState(initialFilters);
  const [results, setResults] = useState<AnyRecord[]>(() => cachedSearch?.results ?? []);
  const [mode, setMode] = useState<string>(() => cachedSearch?.retrieval?.mode ?? "");
  const [searched, setSearched] = useState(Boolean(cachedSearch));
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnyRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function runSearch(nextFilters = filters, force = false) {
    const cached = peekCachedQuery<{ results: AnyRecord[]; retrieval: AnyRecord }>(
      "/api/search",
      nextFilters
    );
    if (cached) {
      setResults(cached.results);
      setMode(cached.retrieval?.mode ?? "");
      setSearched(true);
    }
    setLoading(!cached);
    try {
      const data = await cachedApiGet<{ results: AnyRecord[]; retrieval: AnyRecord }>(
        "/api/search",
        nextFilters,
        { force }
      );
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

  async function confirmDelete() {
    if (!deleteTarget) return;
    const entityId = deleteTarget.entityId ?? deleteTarget.entity_id ?? deleteTarget.id;
    setDeleting(true);
    try {
      await apiDelete(`/api/entities/${entityId}`);
      toast.success(t("search.deleted"));
      setDeleteTarget(null);
      invalidateWorkspaceQueryCache();
      await runSearch(filters, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setDeleting(false);
    }
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
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(dateValue(result, "updatedAt"))}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title={t("common.delete")}
                    aria-label={t("common.delete")}
                    onClick={() => setDeleteTarget(result)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => (!next ? setDeleteTarget(null) : undefined)}
        title={t("search.deleteResult")}
        description={t("search.deleteConfirm", { title: deleteTarget?.title ?? "" })}
        confirmLabel={t("common.delete")}
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
      />
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
