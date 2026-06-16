"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";

export default function ReviewView() {
  const { t, formatDate, translateValue } = useI18n();
  const [items, setItems] = useState<AnyRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await apiGet<{ items: AnyRecord[] }>("/api/review-queue");
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("review.loadError"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(id: string, action: "approve" | "reject") {
    await apiPost(`/api/review-queue/${id}/${action}`, {});
    await load();
  }

  return (
    <>
      <PageHeader
        title={t("review.title")}
        subtitle={t("review.subtitle")}
        actions={
          <button className="button" type="button" onClick={load}>
            <RefreshCw size={16} aria-hidden /> {t("common.refresh")}
          </button>
        }
      />
      <Panel title={t("review.pending")}>
        {error ? <EmptyState>{error}</EmptyState> : null}
        {!items.length ? <EmptyState title={t("review.empty")}>{t("review.subtitle")}</EmptyState> : null}
        <div className="cards-grid">
          {items.map((item) => (
            <article className="item-card" key={item.id}>
              <div className="item-card-header">
                <div>
                  <p className="item-card-title" dir="auto">{translateValue("reviewReason", item.reason)}</p>
                  <p className="item-card-body" dir="auto">{translateValue("action", item.suggestedAction)}</p>
                </div>
                <StatusBadge value={item.status} />
              </div>
              <p className="row-meta">{formatDate(item.createdAt ?? item.created_at)}</p>
              <details className="advanced-details">
                <summary>{t("review.payload")}</summary>
                <pre className="code">{JSON.stringify(item.suggestedPayload, null, 2)}</pre>
              </details>
              <div className="toolbar">
                <button className="button primary" type="button" onClick={() => decide(item.id, "approve")}>
                  <Check size={16} aria-hidden /> {t("common.approve")}
                </button>
                <button className="button danger" type="button" onClick={() => decide(item.id, "reject")}>
                  <X size={16} aria-hidden /> {t("common.reject")}
                </button>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </>
  );
}
