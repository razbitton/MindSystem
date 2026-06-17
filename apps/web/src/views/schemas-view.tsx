"use client";

import { useEffect, useState } from "react";
import type { AnyRecord } from "../lib/api";
import { cachedApiGet, peekCachedQuery } from "../lib/query-cache";
import { EmptyState, EntityBadge, PageHeader, Panel } from "../components/page";
import { Disclosure, CodeBlock } from "../components/disclosure";
import { useI18n } from "../i18n";

const entityTypes = ["project", "task", "note", "document", "decision", "reminder", "person", "goal"] as const;

export default function SchemasView({ embedded = false }: { embedded?: boolean }) {
  const { t, translateValue } = useI18n();
  const [openapi, setOpenapi] = useState<AnyRecord | null>(
    () => peekCachedQuery<AnyRecord>("/api/openapi.json") ?? null
  );

  useEffect(() => {
    cachedApiGet<AnyRecord>("/api/openapi.json").then(setOpenapi).catch(() => setOpenapi(null));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {!embedded ? <PageHeader title={t("schemas.title")} subtitle={t("schemas.subtitle")} /> : null}

      <Panel title={t("schemas.entityModel")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entityTypes.map((type) => (
            <article
              key={type}
              className="bounded-scroll flex flex-col gap-2 rounded-lg border border-border bg-card p-3 [max-block-size:min(28rem,calc(100svh_-_10rem))]"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{translateValue("entity", type)}</p>
                <EntityBadge value={type} />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("schemas.entityDescription")}
              </p>
            </article>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("schemas.openapi")}>
          {openapi ? (
            <Disclosure label={openapi.info?.title ?? t("schemas.openapi")} defaultOpen>
              <CodeBlock>
                {JSON.stringify(
                  { title: openapi.info?.title, paths: Object.keys(openapi.paths ?? {}) },
                  null,
                  2
                )}
              </CodeBlock>
            </Disclosure>
          ) : (
            <EmptyState>{t("schemas.openapiUnavailable")}</EmptyState>
          )}
        </Panel>
        <Panel title={t("schemas.projectOverrides")}>
          <EmptyState>{t("schemas.noOverrides")}</EmptyState>
        </Panel>
      </div>
    </div>
  );
}
