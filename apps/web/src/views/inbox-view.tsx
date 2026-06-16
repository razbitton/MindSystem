"use client";

import { useState } from "react";
import { CheckCircle2, Inbox, Send } from "lucide-react";
import { apiPost, type AnyRecord } from "../lib/api";
import { truncate } from "../lib/view-models";
import { EmptyState, EntityBadge, PageHeader, Panel, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";

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
    } catch (err) {
      setError(err instanceof Error ? err.message : t("inbox.captureFailed"));
    } finally {
      setLoading(false);
    }
  }

  const createdEntities = result?.createdEntities ?? [];
  const reviewItems = result?.reviewItems ?? [];

  return (
    <>
      <PageHeader eyebrow={t("shell.quickCapture")} title={t("inbox.title")} subtitle={t("inbox.subtitle")} />
      <div className="layout-grid">
        <Panel title={t("inbox.capturePanel")}>
          <div className="capture-composer">
            <textarea
              className="textarea"
              dir="auto"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t("inbox.placeholder")}
            />
            <div className="toolbar space-between">
              <p className="row-meta">{t("home.captureHelp")}</p>
              <button className="button primary" type="button" onClick={submit} disabled={loading || !text.trim()}>
                <Send size={16} aria-hidden /> {loading ? t("common.loading") : t("common.capture")}
              </button>
            </div>
          </div>
        </Panel>

        <Panel title={t("inbox.resultPanel")}>
          {error ? <EmptyState>{error}</EmptyState> : null}
          {!result ? (
            <EmptyState title={t("inbox.emptyResult")}>
              {t("home.captureHelp")}
            </EmptyState>
          ) : null}
          {result ? (
            <div className="grid">
              <div className="item-card">
                <div className="item-card-header">
                  <div>
                    <p className="item-card-title">{t("inbox.rawItem")}</p>
                    <p className="item-card-body" dir="ltr">{result.rawItem?.id}</p>
                  </div>
                  <StatusBadge value={result.requiresReview ? "review" : "created"} />
                </div>
                <div className="meta-row">
                  <span>{t("inbox.detectedIntent", { intent: translateValue("intent", result.normalized?.intent) })}</span>
                  <span>{t("inbox.appliedReview", { applied: result.applied ?? 0, review: reviewItems.length })}</span>
                </div>
              </div>

              <section className="grid">
                <div className="toolbar space-between">
                  <h2 className="panel-title">{t("inbox.createdEntities")}</h2>
                  <span className="badge info">{createdEntities.length}</span>
                </div>
                {!createdEntities.length ? <EmptyState>{t("common.nothingHere")}</EmptyState> : null}
                <div className="cards-grid">
                  {createdEntities.map((item: AnyRecord, index: number) => (
                    <div className="item-card" key={item.entity?.id ?? index}>
                      <div className="item-card-header">
                        <div>
                          <p className="item-card-title" dir="auto">{item.entity?.title}</p>
                          <p className="item-card-body" dir="auto">{truncate(item.entity?.summary ?? item.entity?.body, 140)}</p>
                        </div>
                        <EntityBadge value={item.entity?.entityType} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {reviewItems.length ? (
                <section className="grid">
                  <div className="toolbar space-between">
                    <h2 className="panel-title">{t("inbox.reviewNeeded")}</h2>
                    <StatusBadge value="review" />
                  </div>
                  {reviewItems.map((item: AnyRecord) => (
                    <div className="item-card" key={item.id}>
                      <div className="item-card-header">
                        <div>
                          <p className="item-card-title" dir="auto">{translateValue("reviewReason", item.reason)}</p>
                          <p className="item-card-body" dir="auto">{translateValue("action", item.suggestedAction)}</p>
                        </div>
                        <CheckCircle2 size={18} aria-hidden />
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
