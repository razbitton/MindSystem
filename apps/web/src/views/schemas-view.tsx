"use client";

import { useEffect, useState } from "react";
import { apiGet, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel } from "../components/page";
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
      <div className="grid two">
        <Panel title={t("schemas.entityModel")}>
          <div className="row-list">
            {entityTypes.map((type) => (
              <div className="row-item" key={type}>
                <div>
                  <p className="row-title">{translateValue("entity", type)}</p>
                  <p className="row-meta">{t("schemas.entityDescription")}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={t("schemas.openapi")}>
          {openapi ? <pre className="code">{JSON.stringify({ title: openapi.info?.title, paths: Object.keys(openapi.paths ?? {}) }, null, 2)}</pre> : <EmptyState>{t("schemas.openapiUnavailable")}</EmptyState>}
        </Panel>
        <Panel title={t("schemas.projectOverrides")}>
          <EmptyState>{t("schemas.noOverrides")}</EmptyState>
        </Panel>
      </div>
    </>
  );
}
