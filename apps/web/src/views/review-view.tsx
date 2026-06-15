"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel, StatusBadge } from "../components/page";
import { useI18n } from "../i18n";

export default function ReviewView() {
  const { t, translateValue } = useI18n();
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
      <PageHeader title={t("review.title")} subtitle={t("review.subtitle")} actions={<button className="button" onClick={load}><RefreshCw size={16} /> {t("common.refresh")}</button>} />
      <Panel title={t("review.pending")}>
        {error ? <EmptyState>{error}</EmptyState> : null}
        {!items.length ? <EmptyState>{t("review.empty")}</EmptyState> : null}
        <div className="row-list">
          {items.map((item) => (
            <div className="row-item" key={item.id}>
              <div>
                <p className="row-title" dir="auto">{translateValue("reviewReason", item.reason)}</p>
                <p className="row-meta" dir="auto">{translateValue("action", item.suggestedAction)}</p>
                <pre className="code">{JSON.stringify(item.suggestedPayload, null, 2)}</pre>
              </div>
              <div className="toolbar">
                <StatusBadge value={item.status} />
                <button className="button" title={t("common.approve")} aria-label={t("common.approve")} onClick={() => decide(item.id, "approve")}><Check size={16} /></button>
                <button className="button danger" title={t("common.reject")} aria-label={t("common.reject")} onClick={() => decide(item.id, "reject")}><X size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
