"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel, StatusBadge } from "../components/page";
import { Disclosure, CodeBlock } from "../components/disclosure";
import { ConfirmDialog } from "../components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "../i18n";

type Decision = { id: string; action: "approve" | "reject" } | null;

export default function ReviewView() {
  const { t, formatDate, translateValue } = useI18n();
  const [items, setItems] = useState<AnyRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Decision>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await apiGet<{ items: AnyRecord[] }>("/api/review-queue");
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
      await apiPost(`/api/review-queue/${pending.id}/${pending.action}`, {});
      toast.success(pending.action === "approve" ? t("review.approved") : t("review.rejected"));
      setPending(null);
      await load();
    } catch {
      toast.error(t("review.actionError"));
    } finally {
      setBusy(false);
    }
  }

  const isApprove = pending?.action === "approve";

  return (
    <>
      <PageHeader
        title={t("review.title")}
        subtitle={t("review.subtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw aria-hidden /> {t("common.refresh")}
          </Button>
        }
      />

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
        <div className="bounded-scroll grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [max-block-size:min(44rem,calc(100svh_-_11rem))]">
          {items.map((item) => (
            <article
              key={item.id}
              className="bounded-scroll flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs [max-block-size:min(28rem,calc(100svh_-_13rem))]"
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
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => (!next ? setPending(null) : undefined)}
        title={isApprove ? t("review.approveTitle") : t("review.rejectTitle")}
        description={isApprove ? t("review.approveBody") : t("review.rejectBody")}
        confirmLabel={isApprove ? t("review.approve") : t("review.reject")}
        destructive={!isApprove}
        loading={busy}
        onConfirm={confirmDecision}
      />
    </>
  );
}
