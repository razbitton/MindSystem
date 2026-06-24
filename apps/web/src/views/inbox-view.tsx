"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { apiPost, type AnyRecord } from "../lib/api";
import { invalidateWorkspaceQueryCache } from "../lib/query-cache";
import { truncate } from "../lib/view-models";
import { EmptyState, EntityBadge, PageHeader, Panel, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function InboxView() {
  const { t, translateValue } = useI18n();
  const [text, setText] = useState("");
  const [result, setResult] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiPost("/api/ingest/free-text", { text, sourceType: "manual" });
      setResult(response);
      setText("");
      invalidateWorkspaceQueryCache();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("inbox.captureFailed"));
    } finally {
      setLoading(false);
    }
  }

  const createdEntities = result?.createdEntities ?? [];
  const reviewItems = result?.reviewItems ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t("shell.quickCapture")} title={t("inbox.title")} subtitle={t("inbox.subtitle")} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("inbox.capturePanel")}>
          <div className="flex flex-col gap-3">
            <Textarea
              dir="auto"
              rows={6}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t("inbox.placeholder")}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t("home.captureHelp")}</p>
              <Button type="button" size="sm" onClick={submit} disabled={loading || !text.trim()}>
                <Send data-icon="inline-start" />
                {loading ? t("common.loading") : t("common.capture")}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title={t("inbox.resultPanel")}>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {!result && !error ? (
            <EmptyState title={t("inbox.emptyResult")}>{t("home.captureHelp")}</EmptyState>
          ) : null}

          {result ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm font-medium text-foreground">{t("inbox.rawItem")}</p>
                    <p className="truncate text-xs text-muted-foreground" dir="ltr">
                      {result.rawItem?.id}
                    </p>
                  </div>
                  <StatusBadge value={result.requiresReview ? "review" : "created"} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{t("inbox.detectedIntent", { intent: translateValue("intent", result.normalized?.intent) })}</span>
                  <span>{t("inbox.appliedReview", { applied: result.applied ?? 0, review: reviewItems.length })}</span>
                </div>
              </div>

              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-foreground">{t("inbox.createdEntities")}</h3>
                  <Badge variant="info">{createdEntities.length}</Badge>
                </div>
                {!createdEntities.length ? (
                  <EmptyState>{t("common.nothingHere")}</EmptyState>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {createdEntities.map((item: AnyRecord, index: number) => (
                      <div
                        key={item.entity?.id ?? index}
                        className="flex items-start justify-between gap-2 rounded-lg border border-border bg-card p-3"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <p className="truncate text-sm font-medium text-foreground" dir="auto">
                            {item.entity?.title}
                          </p>
                          <p className="text-xs text-muted-foreground" dir="auto">
                            {truncate(item.entity?.summary ?? item.entity?.body, 120)}
                          </p>
                        </div>
                        <EntityBadge value={item.entity?.entityType} />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {reviewItems.length ? (
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-foreground">{t("inbox.reviewNeeded")}</h3>
                    <StatusBadge value="review" />
                  </div>
                  <div className="flex flex-col gap-2">
                    {reviewItems.map((item: AnyRecord) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <p className="text-sm font-medium text-foreground" dir="auto">
                            {translateValue("reviewReason", item.reason)}
                          </p>
                          <p className="text-xs text-muted-foreground" dir="auto">
                            {translateValue("action", item.suggestedAction)}
                          </p>
                        </div>
                        <CheckCircle2 className="size-[18px] shrink-0 text-warning" aria-hidden />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
