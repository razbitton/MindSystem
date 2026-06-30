"use client";

import { useEffect, useState } from "react";
import { Archive, Check, GitMerge, Pin, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateWorkspaceQueryCache,
  peekCachedQuery
} from "../lib/query-cache";
import { EmptyState, PageHeader, Panel, StatusBadge } from "../components/page";
import { Disclosure, CodeBlock } from "../components/disclosure";
import { ConfirmDialog } from "../components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "../i18n";

type ReviewAction = "approve" | "reject" | "delete" | "merge" | "supersede" | "mark-stale" | "pin-preference";
type Decision = { id: string; action: ReviewAction } | null;

export default function ReviewView() {
  const { t, formatDate, translateValue } = useI18n();
  const cachedReview = peekCachedQuery<{ items: AnyRecord[] }>("/api/review-queue");
  const cachedActivity = peekCachedQuery<{ entries: AnyRecord[] }>("/api/ai-activity");
  const [items, setItems] = useState<AnyRecord[]>(() => cachedReview?.items ?? []);
  const [activity, setActivity] = useState<AnyRecord[]>(() => cachedActivity?.entries ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cachedReview);
  const [pending, setPending] = useState<Decision>(null);
  const [busy, setBusy] = useState(false);

  async function load(force = false) {
    setError(null);
    if (!items.length && !peekCachedQuery("/api/review-queue")) {
      setLoading(true);
    }
    try {
      const data = await cachedApiGet<{ items: AnyRecord[] }>("/api/review-queue", undefined, { force });
      setItems(data.items);
      try {
        const activityData = await cachedApiGet<{ entries: AnyRecord[] }>("/api/ai-activity", undefined, { force });
        setActivity(activityData.entries);
      } catch {
        setActivity([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("review.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function confirmDecision() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.action === "delete") {
        await apiDelete(`/api/review-queue/${pending.id}`);
      } else {
        await apiPost(`/api/review-queue/${pending.id}/${pending.action}`, buildReviewActionBody(pendingItem));
      }
      toast.success(
        pending.action === "approve"
          ? t("review.applied")
          : pending.action === "delete"
            ? t("review.deleted")
            : pending.action === "reject"
              ? t("review.rejected")
              : t("review.applied")
      );
      setPending(null);
      invalidateWorkspaceQueryCache();
      await load(true);
    } catch {
      toast.error(t("review.actionError"));
    } finally {
      setBusy(false);
    }
  }

  const isApprove = pending?.action === "approve";
  const isDelete = pending?.action === "delete";
  const pendingItem = pending ? items.find((item) => item.id === pending.id) : null;
  const pendingMarksReviewed = isApprove && isReviewOnlyItem(pendingItem);
  const pendingCard = pendingItem ? buildReviewCard(pendingItem, t, translateValue) : null;

  return (
    <>
      <PageHeader title={t("review.title")} subtitle={t("review.subtitle")} />

      {activity.length ? (
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t("review.activityTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("review.activitySubtitle")}</p>
            </div>
            <Badge variant="muted">{activity.length}</Badge>
          </div>
          <div className="mt-4 divide-y divide-border">
            {activity.slice(0, 6).map((entry) => (
              <div key={String(entry.id)} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{translateValue("reviewReason", String(entry.reason ?? ""))}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {humanize(String(entry.operationType ?? entry.operation_type ?? ""))}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(entry.createdAt ?? entry.created_at)}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {error ? (
        <Panel>
          <EmptyState title={t("review.loadError")}>{error}</EmptyState>
        </Panel>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : !items.length ? (
        <Panel>
          <EmptyState
            title={t("review.allClear")}
            action={
              <div
                className="flex size-11 items-center justify-center rounded-full bg-success/12 text-success"
                aria-hidden
              >
                <ShieldCheck size={22} />
              </div>
            }
          >
            {t("review.allClearBody")}
          </EmptyState>
        </Panel>
      ) : (
        <div className="bounded-scroll grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [max-block-size:min(64rem,calc(100svh_-_8rem))]">
          {items.map((item) => {
            const card = buildReviewCard(item, t, translateValue);
            return (
              <article
                key={item.id}
                className="bounded-scroll flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs [max-block-size:min(42rem,calc(100svh_-_10rem))]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Badge variant={card.tone === "warning" ? "warning" : "info"}>{card.label}</Badge>
                    <h2 className="mt-2 text-sm font-semibold leading-snug text-foreground" dir="auto">
                      {card.title}
                    </h2>
                  </div>
                  <StatusBadge value={item.status} />
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground" dir="auto">
                  {card.description}
                </p>

                <div className="rounded-lg border border-border bg-secondary/25 p-3">
                  <p className="text-xs font-medium text-foreground">{t("review.whatHappens")}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground" dir="auto">
                    {card.impact}
                  </p>
                </div>

                {card.sourceQuote ? (
                  <blockquote className="border-s-2 border-primary/40 ps-3 text-sm leading-relaxed text-muted-foreground" dir="auto">
                    <p className="mb-1 text-xs font-medium text-foreground">{t("review.sourceQuote")}</p>
                    {card.sourceQuote}
                  </blockquote>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {card.badges.map((badge) => (
                    <Badge key={`${item.id}-${badge}`} variant="muted">{badge}</Badge>
                  ))}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(item.createdAt ?? item.created_at)}
                  </span>
                </div>

                {item.suggestedPayload ? (
                  <Disclosure label={t("review.advancedDetails")}>
                    <CodeBlock>{JSON.stringify(item.suggestedPayload, null, 2)}</CodeBlock>
                  </Disclosure>
                ) : null}

                <div className="mt-auto flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => setPending({ id: item.id, action: card.primaryActionName })}
                  >
                    <card.Icon aria-hidden /> {card.primaryAction}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setPending({ id: item.id, action: "reject" })}
                  >
                    <X aria-hidden /> {t("review.reject")}
                  </Button>
                  <Button
                    size="icon"
                    variant="delete"
                    title={t("common.delete")}
                    aria-label={t("common.delete")}
                    onClick={() => setPending({ id: item.id, action: "delete" })}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => (!next ? setPending(null) : undefined)}
        title={isApprove ? (pendingMarksReviewed ? t("review.markReviewedTitle") : t("review.approveTitle")) : isDelete ? t("review.deleteTitle") : pending?.action === "reject" ? t("review.rejectTitle") : t("review.applyTitle")}
        description={isApprove ? (pendingMarksReviewed ? t("review.markReviewedBody") : t("review.approveBody")) : isDelete ? t("review.deleteBody") : pending?.action === "reject" ? t("review.rejectBody") : t("review.applyBody")}
        confirmLabel={isApprove ? (pendingMarksReviewed ? t("review.markReviewed") : t("review.approve")) : isDelete ? t("common.delete") : pending?.action === "reject" ? t("review.reject") : pendingCard?.primaryAction ?? t("review.approve")}
        destructive={!isApprove}
        loading={busy}
        onConfirm={confirmDecision}
      />
    </>
  );
}

type Translate = ReturnType<typeof useI18n>["t"];
type TranslateValue = ReturnType<typeof useI18n>["translateValue"];

function buildReviewCard(item: AnyRecord, t: Translate, translateValue: TranslateValue) {
  const payload = recordValue(item.suggestedPayload);
  const confidence = numberValue(payload, "confidence");
  const badges: string[] = [];
  if (confidence !== null) badges.push(`${t("review.confidence")} ${Math.round(confidence * 100)}%`);
  badges.push(...exceptionBadges(String(item.reason ?? ""), t));

  if (item.suggestedAction === "create_memory_record") {
    const kind = stringValue(payload, "kind");
    const importance = stringValue(payload, "importance");
    const title = stringValue(payload, "title") ?? t("review.untitledMemory");
    const body = stringValue(payload, "summary") ?? stringValue(payload, "body") ?? t("review.noSuggestionBody");
    const projectTitle = stringValue(payload, "projectTitle");
    if (kind) badges.push(`${t("review.memoryKind")}: ${humanize(kind)}`);
    if (importance) badges.push(`${t("review.importance")}: ${humanize(importance)}`);
    if (projectTitle) badges.push(`${t("review.project")}: ${projectTitle}`);

    return {
      tone: "info" as const,
      label: t("review.memorySuggestion"),
      title,
      description: clampText(body, 360),
      impact: t("review.memoryImpact", { kind: kind ? humanize(kind) : t("review.memory") }),
      sourceQuote: clampText(stringValue(payload, "sourceQuote"), 280),
      badges,
      primaryAction: t("review.createMemory"),
      primaryActionName: "approve" as const,
      Icon: Check
    };
  }

  if (item.suggestedAction === "merge_memory_records") {
    const duplicates = arrayValue(payload, "duplicateMemoryIds").length;
    if (duplicates) badges.push(`${t("review.duplicates")}: ${duplicates}`);
    return {
      tone: "info" as const,
      label: t("review.mergeMemory"),
      title: stringValue(payload, "title") ?? t("review.untitledMemory"),
      description: clampText(stringValue(payload, "summary") ?? stringValue(payload, "body") ?? t("review.noSuggestionBody"), 360),
      impact: t("review.mergeImpact"),
      sourceQuote: null,
      badges,
      primaryAction: t("review.merge"),
      primaryActionName: "merge" as const,
      Icon: GitMerge
    };
  }

  if (item.suggestedAction === "supersede_memory") {
    return {
      tone: "warning" as const,
      label: t("review.supersedeMemory"),
      title: stringValue(payload, "title") ?? t("review.untitledMemory"),
      description: clampText(stringValue(payload, "summary") ?? stringValue(payload, "body") ?? t("review.noSuggestionBody"), 360),
      impact: t("review.supersedeImpact"),
      sourceQuote: clampText(stringValue(payload, "sourceQuote"), 280),
      badges,
      primaryAction: t("review.supersede"),
      primaryActionName: "supersede" as const,
      Icon: RotateCcw
    };
  }

  if (item.suggestedAction === "mark_memory_stale") {
    return {
      tone: "warning" as const,
      label: t("review.staleMemory"),
      title: stringValue(payload, "title") ?? t("review.untitledMemory"),
      description: t("review.staleMemoryBody"),
      impact: t("review.staleImpact"),
      sourceQuote: null,
      badges,
      primaryAction: t("review.markStale"),
      primaryActionName: "mark-stale" as const,
      Icon: Archive
    };
  }

  if (item.suggestedAction === "pin_preference") {
    return {
      tone: "info" as const,
      label: t("review.pinPreference"),
      title: stringValue(payload, "title") ?? t("review.untitledMemory"),
      description: t("review.pinPreferenceBody"),
      impact: t("review.pinPreferenceImpact"),
      sourceQuote: null,
      badges,
      primaryAction: t("review.pin"),
      primaryActionName: "pin-preference" as const,
      Icon: Pin
    };
  }

  if (isReviewOnlyItem(item)) {
    const error = stringValue(payload, "error");
    return {
      tone: "warning" as const,
      label: t("review.processingNotice"),
      title: translateValue("reviewReason", item.reason),
      description: error ? clampText(error, 360) : t("review.processingNoticeBody"),
      impact: t("review.processingNoticeImpact"),
      sourceQuote: null,
      badges,
      primaryAction: t("review.markReviewed"),
      primaryActionName: "approve" as const,
      Icon: Check
    };
  }

  const title = stringValue(payload, "title") ?? translateValue("reviewReason", item.reason);
  const body = stringValue(payload, "body") ?? stringValue(payload, "description") ?? stringValue(payload, "summary") ?? t("review.noSuggestionBody");
  return {
    tone: "info" as const,
    label: translateValue("action", item.suggestedAction),
    title,
    description: clampText(body, 360),
    impact: t("review.genericImpact"),
    sourceQuote: null,
    badges,
    primaryAction: t("review.approve"),
    primaryActionName: "approve" as const,
    Icon: Check
  };
}

function isReviewOnlyItem(item: AnyRecord | null | undefined) {
  return item?.suggestedAction === "inspect_raw_item" || item?.suggestedAction === "inspect_normalization";
}

function recordValue(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function stringValue(value: AnyRecord, key: string) {
  const next = value[key];
  return typeof next === "string" && next.trim() ? next.trim() : null;
}

function numberValue(value: AnyRecord, key: string) {
  const next = value[key];
  return typeof next === "number" && Number.isFinite(next) ? next : null;
}

function arrayValue(value: AnyRecord, key: string) {
  const next = value[key];
  return Array.isArray(next) ? next : [];
}

function exceptionBadges(reason: string, t: Translate) {
  const badges: string[] = [];
  if (reason.includes("conflict")) badges.push(t("review.reasonConflict"));
  if (reason.includes("ambiguous")) badges.push(t("review.reasonAmbiguity"));
  if (reason.includes("sensitive")) badges.push(t("review.reasonSensitive"));
  if (reason.includes("destructive") || reason.includes("delete")) badges.push(t("review.reasonDestructive"));
  if (reason.includes("low_confidence") || reason.includes("medium_confidence")) badges.push(t("review.reasonLowConfidence"));
  if (reason.includes("bulk")) badges.push(t("review.reasonBulk"));
  if (reason.includes("missing_source_quote")) badges.push(t("review.reasonSource"));
  return [...new Set(badges)];
}

function buildReviewActionBody(item: AnyRecord | null | undefined) {
  if (!item) return {};
  const payload = recordValue(item.suggestedPayload);
  const targetMemoryId = stringValue(payload, "targetMemoryId") ?? stringValue(payload, "memoryId");
  if (item.suggestedAction === "merge_memory_records" && targetMemoryId) {
    return { targetMemoryId, editedPayload: payload };
  }
  if (item.suggestedAction === "supersede_memory" && targetMemoryId) {
    return { targetMemoryId, editedPayload: payload };
  }
  return {};
}

function clampText(value: string | null, max: number) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trim()}…`;
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();
}
