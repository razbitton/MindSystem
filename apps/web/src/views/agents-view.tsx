"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { agentScopeValues } from "@personal-context-os/shared";
import { apiGet, apiPost, type AnyRecord } from "../lib/api";
import { EmptyState, PageHeader, Panel } from "../components/page";
import { useI18n } from "../i18n";

export default function AgentsView() {
  const { t, formatDate, translateValue } = useI18n();
  const [data, setData] = useState<AnyRecord>({ tokens: [], runs: [], auditEvents: [] });
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["memory:read", "projects:read", "tasks:read"]);
  const [createdToken, setCreatedToken] = useState<string>("");

  async function load() {
    setData(await apiGet("/api/agents"));
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    const response = await apiPost<{ plaintextToken: string }>("/api/agents/tokens", { name: name.trim() || t("agents.defaultName"), scopes });
    setCreatedToken(response.plaintextToken);
    await load();
  }

  const config = useMemo(() => JSON.stringify({
    mcpServers: {
      "personal-context-os": {
        url: "http://localhost:4100/mcp",
        headers: {
          Authorization: `Bearer ${createdToken || "pcos_created_token"}`
        }
      }
    }
  }, null, 2), [createdToken]);

  return (
    <>
      <PageHeader title={t("agents.title")} subtitle={t("agents.subtitle")} actions={<button className="button" onClick={load}><RefreshCw size={16} /> {t("common.refresh")}</button>} />
      <div className="grid two">
        <Panel title={t("agents.createToken")}>
          <div className="form-grid">
            <input className="input" dir="auto" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("agents.defaultName")} />
            <div className="grid two">
              {agentScopeValues.map((scope) => (
                <label className="toolbar" key={scope} dir="ltr">
                  <input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => setScopes(event.target.checked ? [...scopes, scope] : scopes.filter((item) => item !== scope))} />
                  <span>{scope}</span>
                </label>
              ))}
            </div>
            <button className="button primary" onClick={create}><KeyRound size={16} /> {t("agents.createToken")}</button>
            {createdToken ? <pre className="code">{createdToken}</pre> : null}
          </div>
        </Panel>
        <Panel title={t("agents.mcpConfiguration")}>
          <pre className="code">{config}</pre>
        </Panel>
        <Panel title={t("agents.tokens")}>
          <Rows rows={data.tokens ?? []} title={(row) => row.name} meta={(row) => <><span dir="ltr">{row.scopes?.join(", ")}</span> - {formatDate(row.createdAt ?? row.created_at)}</>} />
        </Panel>
        <Panel title={t("agents.agentRuns")}>
          <Rows rows={data.runs ?? []} title={(row) => row.toolName ?? row.tool_name} meta={(row) => `${translateValue("status", row.status)} - ${formatDate(row.startedAt ?? row.started_at)}`} />
        </Panel>
        <Panel title={t("agents.auditEvents")}>
          <Rows rows={data.auditEvents ?? []} title={(row) => translateValue("action", row.action)} meta={(row) => `${translateValue("actor", row.actorType ?? row.actor_type)} - ${formatDate(row.createdAt ?? row.created_at)}`} />
        </Panel>
      </div>
    </>
  );
}

function Rows({ rows, title, meta }: { rows: AnyRecord[]; title: (row: AnyRecord) => React.ReactNode; meta: (row: AnyRecord) => React.ReactNode }) {
  const { t } = useI18n();
  if (!rows.length) return <EmptyState>{t("common.nothingRecorded")}</EmptyState>;
  return (
    <div className="row-list">
      {rows.map((row) => (
        <div className="row-item" key={row.id}>
          <div>
            <p className="row-title" dir="auto">{title(row)}</p>
            <div className="row-meta">{meta(row)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
