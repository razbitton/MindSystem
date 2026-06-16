"use client";

import { useEffect, useState } from "react";
import { apiGet, type AnyRecord } from "../lib/api";
import { EmptyState, EntityBadge, PageHeader, Panel } from "../components/page";
import { useI18n } from "../i18n";

const entityTypes = ["project", "task", "note", "document", "decision", "reminder", "person", "goal"] as const;

export default function SchemasView() {
  const { t, translateValue } = useI18n();
  const [openapi, setOpenapi] = useState<AnyRecord | null>(null);

  useEffect(() => {
    apiGet<AnyRecord>("/api/openapi.json").then(setOpenapi).catch(() => setOpenapi(null));
  }, []);

  return (
    <>
      <PageHeader title={t("schemas.title")} subtitle={t("schemas.subtitle")} />
      <div className="layout-grid">
        <Panel title={t("schemas.entityModel")}>
          <div className="cards-grid">
            {entityTypes.map((type) => (
              <article className="item-card" key={type}>
                <div className="item-card-header">
                  <p className="item-card-title">{translateValue("entity", type)}</p>
                  <EntityBadge value={type} />
                </div>
                <p className="item-card-body">{t("schemas.entityDescription")}</p>
              </article>
            ))}
          </div>
        </Panel>
        <div className="grid">
          <Panel title={t("schemas.openapi")}>
            {openapi ? (
              <details className="advanced-details" open>
                <summary>{openapi.info?.title ?? t("schemas.openapi")}</summary>
                <pre className="code">{JSON.stringify({ title: openapi.info?.title, paths: Object.keys(openapi.paths ?? {}) }, null, 2)}</pre>
              </details>
            ) : (
              <EmptyState>{t("schemas.openapiUnavailable")}</EmptyState>
            )}
          </Panel>
          <Panel title={t("schemas.projectOverrides")}>
            <EmptyState>{t("schemas.noOverrides")}</EmptyState>
          </Panel>
        </div>
      </div>
    </>
  );
}
