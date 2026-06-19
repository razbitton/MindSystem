"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { agentScopeValues } from "@personal-context-os/shared";
import { apiDelete, apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateCachedQueries,
  peekCachedQuery
} from "../lib/query-cache";
import { EmptyState, PageHeader, Panel, StatusBadge } from "../components/page";
import { Disclosure, CodeBlock } from "../components/disclosure";
import { ConfirmDialog } from "../components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "../i18n";

type PendingTokenAction = { kind: "revoke" | "delete"; token: AnyRecord } | null;

export default function AgentsView({ embedded = false }: { embedded?: boolean }) {
  const { t, formatDate, translateValue } = useI18n();
  const [data, setData] = useState<AnyRecord>(
    () => peekCachedQuery<AnyRecord>("/api/agents") ?? { tokens: [], runs: [], auditEvents: [] }
  );
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["memory:read", "projects:read", "tasks:read"]);
  const [createdToken, setCreatedToken] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [pendingTokenAction, setPendingTokenAction] = useState<PendingTokenAction>(null);
  const [busy, setBusy] = useState(false);

  async function load(force = false) {
    setData(await cachedApiGet("/api/agents", undefined, { force }));
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    const response = await apiPost<{ plaintextToken: string }>("/api/agents/tokens", {
      name: name.trim() || t("agents.defaultName"),
      scopes
    });
    setCreatedToken(response.plaintextToken);
    toast.success(t("agents.createdToken"));
    invalidateCachedQueries("GET /api/agents");
    await load(true);
  }

  async function copyToken() {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken);
    setCopied(true);
    toast.success(t("common.copied"));
    setTimeout(() => setCopied(false), 1500);
  }

  async function confirmTokenAction() {
    if (!pendingTokenAction) return;
    setBusy(true);
    try {
      if (pendingTokenAction.kind === "revoke") {
        await apiPost(`/api/agents/tokens/${pendingTokenAction.token.id}/revoke`, {});
        toast.success(t("agents.revokedToken"));
      } else {
        await apiDelete(`/api/agents/tokens/${pendingTokenAction.token.id}`);
        toast.success(t("agents.deletedToken"));
      }
      setPendingTokenAction(null);
      invalidateCachedQueries("GET /api/agents");
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setBusy(false);
    }
  }

  const config = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            "personal-context-os": {
              url: "http://localhost:4100/mcp",
              headers: {
                Authorization: `Bearer ${createdToken || "<create_an_agent_token_first>"}`
              }
            }
          }
        },
        null,
        2
      ),
    [createdToken]
  );

  return (
    <div className="flex flex-col gap-6">
      {!embedded ? (
        <PageHeader
          title={t("agents.title")}
          subtitle={t("agents.subtitle")}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("agents.createToken")}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agent-token-name">{t("common.title")}</Label>
              <Input
                id="agent-token-name"
                dir="auto"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("agents.defaultName")}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{t("agents.scopes")}</span>
                <Badge variant="muted">
                  {t("agents.selectedScopes")}: {scopes.length}
                </Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {agentScopeValues.map((scope) => {
                  const checked = scopes.includes(scope);
                  return (
                    <label
                      key={scope}
                      dir="ltr"
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          setScopes(
                            value ? [...scopes, scope] : scopes.filter((item) => item !== scope)
                          )
                        }
                      />
                      <span className="font-mono text-xs text-foreground">{scope}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <Button type="button" onClick={create} disabled={!scopes.length} className="self-start">
              <KeyRound aria-hidden /> {t("agents.createToken")}
            </Button>

            {createdToken ? (
              <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">{t("agents.createdToken")}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={copyToken}>
                    {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                    {t("common.copy")}
                  </Button>
                </div>
                <code className="break-all font-mono text-xs text-muted-foreground" dir="ltr">
                  {createdToken}
                </code>
              </div>
            ) : null}
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title={t("agents.mcpConfiguration")}>
            <Disclosure label={t("agents.connectionDetails")} defaultOpen>
              <CodeBlock>{config}</CodeBlock>
            </Disclosure>
          </Panel>
          <Panel title={t("agents.tokens")}>
            <Rows
              rows={data.tokens ?? []}
              title={(row) => row.name}
              meta={(row) => (
                <>
                  <span dir="ltr">{row.scopes?.join(", ")}</span> · {formatDate(row.createdAt ?? row.created_at)}
                </>
              )}
              action={(row) => {
                const revoked = Boolean(row.revokedAt ?? row.revoked_at);
                return (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title={t("agents.revokeToken")}
                      aria-label={t("agents.revokeToken")}
                      disabled={revoked}
                      onClick={() => setPendingTokenAction({ kind: "revoke", token: row })}
                    >
                      <Ban aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title={t("common.delete")}
                      aria-label={t("common.delete")}
                      onClick={() => setPendingTokenAction({ kind: "delete", token: row })}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                );
              }}
            />
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("agents.agentRuns")}>
          <Rows
            rows={data.runs ?? []}
            title={(row) => row.toolName ?? row.tool_name}
            meta={(row) => (
              <span className="inline-flex items-center gap-2">
                <StatusBadge value={row.status} /> {formatDate(row.startedAt ?? row.started_at)}
              </span>
            )}
          />
        </Panel>
        <Panel title={t("agents.auditEvents")}>
          <Rows
            rows={data.auditEvents ?? []}
            title={(row) => translateValue("action", row.action)}
            meta={(row) =>
              `${translateValue("actor", row.actorType ?? row.actor_type)} · ${formatDate(row.createdAt ?? row.created_at)}`
            }
          />
        </Panel>
      </div>

      <ConfirmDialog
        open={pendingTokenAction !== null}
        onOpenChange={(next) => (!next ? setPendingTokenAction(null) : undefined)}
        title={pendingTokenAction?.kind === "revoke" ? t("agents.revokeToken") : t("agents.deleteToken")}
        description={
          pendingTokenAction?.kind === "revoke"
            ? t("agents.revokeConfirm", { title: pendingTokenAction.token.name ?? "" })
            : t("agents.deleteConfirm", { title: pendingTokenAction?.token.name ?? "" })
        }
        confirmLabel={pendingTokenAction?.kind === "revoke" ? t("agents.revokeToken") : t("common.delete")}
        destructive
        loading={busy}
        onConfirm={confirmTokenAction}
      />
    </div>
  );
}

function Rows({
  rows,
  title,
  meta,
  action
}: {
  rows: AnyRecord[];
  title: (row: AnyRecord) => React.ReactNode;
  meta: (row: AnyRecord) => React.ReactNode;
  action?: (row: AnyRecord) => React.ReactNode;
}) {
  const { t } = useI18n();
  if (!rows.length) return <EmptyState>{t("common.nothingRecorded")}</EmptyState>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.slice(0, 8).map((row) => (
        <li key={row.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-foreground" dir="auto">
              {title(row)}
            </p>
            <div className="text-xs text-muted-foreground" dir="auto">
              {meta(row)}
            </div>
          </div>
          {action ? action(row) : null}
        </li>
      ))}
    </ul>
  );
}
