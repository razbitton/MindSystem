"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Database, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateWorkspaceQueryCache,
  peekCachedQuery
} from "../lib/query-cache";
import { ConfirmDialog } from "../components/confirm-dialog";
import { EmptyState, Panel } from "../components/page";
import { dateValue, truncate } from "../lib/view-models";
import { useI18n } from "../i18n";
import { Button } from "@/components/ui/button";

const fullPurgeTypes = [
  "raw_items",
  "entities",
  "review_queue",
  "audit_events",
  "agent_runs",
  "retrieval_logs",
  "schema_definitions",
  "project_schema_overrides"
];

const activityPurgeTypes = ["audit_events", "agent_runs", "retrieval_logs"];

const countKeys = [
  ["rawItems", "Raw captures"],
  ["entities", "Entities"],
  ["projects", "Projects"],
  ["tasks", "Tasks"],
  ["notes", "Notes"],
  ["documents", "Documents"],
  ["reminders", "Reminders"],
  ["reviewQueue", "Review"],
  ["auditEvents", "Audit events"],
  ["agentRuns", "Agent runs"],
  ["retrievalLogs", "Search logs"]
] as const;

type PendingAction =
  | { kind: "deleteRaw"; id: string; title: string }
  | { kind: "clearRaw" }
  | { kind: "clearActivity" }
  | { kind: "purgeWorkspace" }
  | null;

export default function DataManagementView() {
  const { t, formatDate, translateValue } = useI18n();
  const [inventory, setInventory] = useState<AnyRecord>(
    () => peekCachedQuery<{ counts: AnyRecord }>("/api/admin/data-inventory")?.counts ?? {}
  );
  const [rawItems, setRawItems] = useState<AnyRecord[]>(
    () => peekCachedQuery<{ rawItems: AnyRecord[] }>("/api/raw-items", { limit: 10 })?.rawItems ?? []
  );
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);

  async function load(force = false) {
    const [inventoryData, rawData] = await Promise.all([
      cachedApiGet<{ counts: AnyRecord }>("/api/admin/data-inventory", undefined, { force }),
      cachedApiGet<{ rawItems: AnyRecord[] }>("/api/raw-items", { limit: 10 }, { force })
    ]);
    setInventory(inventoryData.counts);
    setRawItems(rawData.rawItems);
  }

  useEffect(() => {
    void load();
  }, []);

  async function confirmAction() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "deleteRaw") {
        await apiPost(`/api/raw-items/${pending.id}/delete`, { deleteDerivedEntities: false });
      } else if (pending.kind === "clearRaw") {
        await apiPost("/api/raw-items/clear", { deleteDerivedEntities: false });
      } else if (pending.kind === "clearActivity") {
        await apiPost("/api/admin/purge-data", { types: activityPurgeTypes });
      } else if (pending.kind === "purgeWorkspace") {
        await apiPost("/api/admin/purge-data", { types: fullPurgeTypes });
      }

      toast.success(t("dataManagement.completed"));
      setPending(null);
      invalidateWorkspaceQueryCache();
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("dataManagement.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title={t("dataManagement.inventory")}
        action={
          <Button type="button" size="sm" variant="ghost" onClick={() => void load(true)}>
            <RefreshCw aria-hidden />
            {t("common.refresh")}
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {countKeys.map(([key, label]) => (
            <div key={key} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border p-3">
              <span className="truncate text-sm text-muted-foreground">{label}</span>
              <span className="text-lg font-semibold tabular-nums text-foreground">{Number(inventory[key] ?? 0)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("dataManagement.rawCaptures")}>
          {!rawItems.length ? (
            <EmptyState>{t("common.nothingRecorded")}</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {rawItems.map((item) => (
                <li key={item.id} className="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="break-words text-sm text-foreground" dir="auto">
                      {truncate(item.rawText ?? item.raw_text, 140)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {translateValue("source", item.sourceType ?? item.source_type)} - {formatDate(dateValue(item, "createdAt"))}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="delete"
                    title={t("common.delete")}
                    aria-label={t("common.delete")}
                    onClick={() =>
                      setPending({
                        kind: "deleteRaw",
                        id: String(item.id),
                        title: truncate(item.rawText ?? item.raw_text, 80)
                      })
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("dataManagement.destructiveOperations")}>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3 rounded-lg border border-warning/35 bg-warning/10 p-3 text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="text-sm leading-relaxed text-foreground">{t("dataManagement.destructiveHelp")}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => setPending({ kind: "clearRaw" })}>
                <Trash2 aria-hidden />
                {t("dataManagement.clearRawCaptures")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPending({ kind: "clearActivity" })}>
                <Database aria-hidden />
                {t("dataManagement.clearActivity")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="sm:col-span-2"
                onClick={() => setPending({ kind: "purgeWorkspace" })}
              >
                <AlertTriangle aria-hidden />
                {t("dataManagement.purgeWorkspace")}
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => (!next ? setPending(null) : undefined)}
        title={dialogTitle(t, pending)}
        description={dialogDescription(t, pending) ?? ""}
        confirmLabel={t("common.delete")}
        destructive
        loading={busy}
        onConfirm={confirmAction}
      />
    </div>
  );
}

function dialogTitle(t: ReturnType<typeof useI18n>["t"], pending: PendingAction) {
  if (pending?.kind === "deleteRaw") return t("dataManagement.deleteRawTitle");
  if (pending?.kind === "clearRaw") return t("dataManagement.clearRawTitle");
  if (pending?.kind === "clearActivity") return t("dataManagement.clearActivityTitle");
  if (pending?.kind === "purgeWorkspace") return t("dataManagement.purgeTitle");
  return t("common.delete");
}

function dialogDescription(t: ReturnType<typeof useI18n>["t"], pending: PendingAction) {
  if (pending?.kind === "deleteRaw") return t("dataManagement.deleteRawBody", { title: pending.title });
  if (pending?.kind === "clearRaw") return t("dataManagement.clearRawBody");
  if (pending?.kind === "clearActivity") return t("dataManagement.clearActivityBody");
  if (pending?.kind === "purgeWorkspace") return t("dataManagement.purgeBody");
  return undefined;
}
