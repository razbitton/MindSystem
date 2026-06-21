"use client";

import { useEffect, useState } from "react";
import { Check, ShieldCheck, Trash2, X } from "lucide-react";
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

type Decision = { id: string; action: "approve" | "reject" | "delete" } | null;

export default function ReviewView() {
  const { t, formatDate, translateValue } = useI18n();
  const cachedReview = peekCachedQuery<{ items: AnyRecord[] }>("/api/review-queue");
  const [items, setItems] = useState<AnyRecord[]>(() => cachedReview?.items ?? []);
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
        await apiPost(`/api/review-queue/${pending.id}/${pending.action}`, {});
      }
      toast.success(
        pending.action === "approve"
          ? t("review.approved")
          : pending.action === "delete"
            ? t("review.deleted")
            : t("review.rejected")
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

  return (
    <>
      <PageHeader title={t("review.title")} subtitle={t("review.subtitle")} />

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
          {items.map((item) => (
            <article
              key={item.id}
              className="bounded-scroll flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs [max-block-size:min(42rem,calc(100svh_-_10rem))]"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug text-foreground" dir="auto">
                  {translateValue("reviewReason", item.reason)}
                </p>
                <StatusBadge value={item.status} />
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground" dir="auto">
                {translateValue("action", item.suggestedAction)}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {typeof item.confidence === "number" ? (
                  <Badge variant="muted">
                    {t("review.confidence")} {Math.round(item.confidence * 100)}%
                  </Badge>
                ) : null}
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
                  onClick={() => setPending({ id: item.id, action: "approve" })}
                >
                  <Check aria-hidden /> {t("review.approve")}
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
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => (!next ? setPending(null) : undefined)}
        title={isApprove ? t("review.approveTitle") : isDelete ? t("review.deleteTitle") : t("review.rejectTitle")}
        description={isApprove ? t("review.approveBody") : isDelete ? t("review.deleteBody") : t("review.rejectBody")}
        confirmLabel={isApprove ? t("review.approve") : isDelete ? t("common.delete") : t("review.reject")}
        destructive={!isApprove}
        loading={busy}
        onConfirm={confirmDecision}
      />
    </>
  );
}
