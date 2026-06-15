"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { apiPost, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel, StatusBadge } from "../components/page";
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

  return (
    <>
      <PageHeader title={t("inbox.title")} subtitle={t("inbox.subtitle")} />
      <div className="grid two">
        <Panel title={t("inbox.capturePanel")}>
          <div className="form-grid">
            <textarea
              className="textarea"
              dir="auto"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t("inbox.placeholder")}
            />
            <button className="button primary" onClick={submit} disabled={loading || !text.trim()}>
              <Send size={16} /> {t("common.capture")}
            </button>
          </div>
        </Panel>
        <Panel title={t("inbox.resultPanel")}>
          {error ? <EmptyState>{error}</EmptyState> : null}
          {!result ? <EmptyState>{t("inbox.emptyResult")}</EmptyState> : null}
          {result ? (
            <div className="row-list">
              <div className="row-item">
                <div>
                  <p className="row-title">{t("inbox.rawItem")}</p>
                  <p className="row-meta" dir="ltr">{result.rawItem?.id}</p>
                </div>
                <StatusBadge value={result.requiresReview ? "review" : "created"} />
              </div>
              <div className="row-item">
                <div>
                  <p className="row-title">{t("inbox.detectedIntent", { intent: translateValue("intent", result.normalized?.intent) })}</p>
                  <p className="row-meta">{t("inbox.appliedReview", { applied: result.applied ?? 0, review: result.requiresReview ?? 0 })}</p>
                </div>
              </div>
              {(result.createdEntities ?? []).map((item: AnyRecord, index: number) => (
                <div className="row-item" key={item.entity?.id ?? index}>
                  <div>
                    <p className="row-title" dir="auto">{item.entity?.title}</p>
                    <p className="row-meta">{translateValue("entity", item.entity?.entityType)}</p>
                  </div>
                </div>
              ))}
              {(result.reviewItems ?? []).map((item: AnyRecord) => (
                <div className="row-item" key={item.id}>
                  <div>
                    <p className="row-title" dir="auto">{translateValue("reviewReason", item.reason)}</p>
                    <p className="row-meta" dir="auto">{translateValue("action", item.suggestedAction)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
