"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Unplug
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../i18n";
import { apiPost } from "../lib/api";
import {
  cachedApiGet,
  invalidateCachedQueries
} from "../lib/query-cache";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OpenAICodexStatus = {
  configured: boolean;
  authMode: string;
  connected: boolean;
  source: string | null;
  accountId: string | null;
  email: string | null;
  chatgptPlanType: string | null;
  expiryDate: string | null;
};

type OpenAICodexStartResponse = {
  verificationUrl: string;
  userCode: string;
  deviceAuthId: string;
  intervalMs: number;
  expiresInMs: number;
};

type OpenAICodexPollResponse = {
  connected: boolean;
  pending: boolean;
};

type OpenAICodexTranslator = ReturnType<typeof useI18n>["t"];
type OpenAICodexTranslationKey = Parameters<OpenAICodexTranslator>[0];

const openAICodexCachePrefix = "GET /api/openai-codex";
const errorTranslationRules: { match: string; key: OpenAICodexTranslationKey }[] = [
  { match: "OpenAI Codex OAuth is not configured", key: "openaiCodex.notConfigured" },
  { match: "OPENAI_CODEX_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key", key: "openaiCodex.invalidEncryptionKey" },
  { match: "OpenAI Codex OAuth requires a signed-in user session", key: "openaiCodex.signedInRequired" },
  { match: "OpenAI Codex device code request failed", key: "openaiCodex.connectFailed" },
  { match: "OpenAI Codex device authorization failed", key: "openaiCodex.connectError" },
  { match: "OpenAI Codex token exchange failed", key: "openaiCodex.connectError" }
];

export function OpenAICodexPanel() {
  const { t, formatDate } = useI18n();
  const [status, setStatus] = useState<OpenAICodexStatus | null>(null);
  const [flow, setFlow] = useState<OpenAICodexStartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const flowStartedAtRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);

  const loadStatus = useCallback(async (force = false) => {
    setError(null);
    setLoading(true);
    try {
      const nextStatus = await cachedApiGet<OpenAICodexStatus>("/api/openai-codex/status", undefined, { force });
      setStatus(nextStatus);
    } catch (err) {
      setError(openAICodexErrorMessage(err, t, "openaiCodex.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadStatus(true);
  }, [loadStatus]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!flow) return undefined;

    setRemainingMs(flow.expiresInMs);
    const interval = window.setInterval(() => {
      const nextRemainingMs = Math.max(0, flow.expiresInMs - (Date.now() - flowStartedAtRef.current));
      setRemainingMs(nextRemainingMs);
      if (nextRemainingMs <= 0) {
        window.clearInterval(interval);
        setFlow(null);
        setPolling(false);
        toast.error(t("openaiCodex.expired"));
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [flow, t]);

  useEffect(() => {
    if (!flow) return undefined;

    let cancelled = false;

    async function poll() {
      if (!flow || cancelled) return;
      if (Date.now() - flowStartedAtRef.current >= flow.expiresInMs) return;

      setPolling(true);
      try {
        const response = await apiPost<OpenAICodexPollResponse>("/api/openai-codex/oauth/poll", {
          deviceAuthId: flow.deviceAuthId,
          userCode: flow.userCode
        });

        if (cancelled) return;
        if (response.connected) {
          setFlow(null);
          invalidateCachedQueries(openAICodexCachePrefix);
          toast.success(t("openaiCodex.connected"));
          await loadStatus(true);
          return;
        }

        pollTimerRef.current = window.setTimeout(poll, flow.intervalMs);
      } catch (err) {
        if (!cancelled) {
          toast.error(openAICodexErrorMessage(err, t, "openaiCodex.connectError"));
        }
      } finally {
        if (!cancelled) setPolling(false);
      }
    }

    pollTimerRef.current = window.setTimeout(poll, flow.intervalMs);
    return () => {
      cancelled = true;
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, [flow, loadStatus, t]);

  async function startConnection() {
    setStarting(true);
    setError(null);
    try {
      const nextFlow = await apiPost<OpenAICodexStartResponse>("/api/openai-codex/oauth/start", {});
      flowStartedAtRef.current = Date.now();
      setFlow(nextFlow);
      setRemainingMs(nextFlow.expiresInMs);
      toast.message(t("openaiCodex.deviceTitle"));
    } catch (err) {
      toast.error(openAICodexErrorMessage(err, t, "openaiCodex.connectFailed"));
    } finally {
      setStarting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await apiPost("/api/openai-codex/disconnect", {});
      setFlow(null);
      invalidateCachedQueries(openAICodexCachePrefix);
      toast.success(t("openaiCodex.disconnected"));
      await loadStatus(true);
    } catch (err) {
      toast.error(openAICodexErrorMessage(err, t));
    } finally {
      setDisconnecting(false);
    }
  }

  async function copyUserCode() {
    if (!flow) return;
    try {
      await window.navigator.clipboard.writeText(flow.userCode);
      toast.success(t("common.copied"));
    } catch {
      toast.error(t("common.failed"));
    }
  }

  const active = Boolean(status?.connected && status.authMode === "codex");
  const canDisconnect = status?.connected && status.source === "stored_oauth";

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex min-w-0 items-center gap-2">
            <Bot className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{t("openaiCodex.title")}</span>
          </CardTitle>
          <CardDescription>{t("openaiCodex.subtitle")}</CardDescription>
        </div>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => void loadStatus(true)}
            disabled={loading}
            title={t("common.refresh")}
            aria-label={t("common.refresh")}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <div className="flex min-h-24 items-center text-sm text-muted-foreground">
            <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
            {t("common.loading")}
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : status ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={active ? "success" : status.connected ? "warning" : "muted"}>
                {active
                  ? t("openaiCodex.statusActive")
                  : status.connected
                    ? t("openaiCodex.statusInactive")
                    : t("openaiCodex.statusDisconnected")}
              </Badge>
              <Badge variant="outline">{t("openaiCodex.mode")}: {status.authMode}</Badge>
              {status.source ? <Badge variant="outline">{formatSource(status.source, t)}</Badge> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <ConnectionDatum label={t("openaiCodex.account")} value={status.email ?? status.accountId ?? t("common.none")} />
              <ConnectionDatum label={t("openaiCodex.plan")} value={status.chatgptPlanType ?? t("common.none")} />
              <ConnectionDatum label={t("openaiCodex.expires")} value={status.expiryDate ? formatDate(status.expiryDate) : t("common.noDate")} />
            </div>

            {!status.configured ? (
              <Alert>
                <AlertCircle aria-hidden />
                <AlertDescription>{t("openaiCodex.configureHelp")}</AlertDescription>
              </Alert>
            ) : null}

            {status.connected && status.authMode !== "codex" ? (
              <Alert>
                <AlertCircle aria-hidden />
                <AlertDescription>{t("openaiCodex.authModeHelp")}</AlertDescription>
              </Alert>
            ) : null}

            {status.connected && status.source === "env_access_token" ? (
              <Alert>
                <CheckCircle2 aria-hidden />
                <AlertDescription>{t("openaiCodex.envManaged")}</AlertDescription>
              </Alert>
            ) : null}

            {flow ? (
              <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-secondary/45 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t("openaiCodex.deviceTitle")}</p>
                  <p className="text-sm text-muted-foreground">{t("openaiCodex.deviceBody")}</p>
                </div>

                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("openaiCodex.authorizationCode")}</span>
                    <code className="truncate text-lg font-semibold tracking-widest text-foreground" dir="ltr">
                      {flow.userCode}
                    </code>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void copyUserCode()}>
                      <Copy data-icon="inline-start" />
                      {t("openaiCodex.copyCode")}
                    </Button>
                    <Button type="button" size="sm" asChild>
                      <a href={flow.verificationUrl} target="_blank" rel="noreferrer">
                        <ExternalLink data-icon="inline-start" />
                        {t("openaiCodex.openAuthorization")}
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {polling ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                  <span>{t("openaiCodex.waiting")}</span>
                  <span aria-hidden>/</span>
                  <span>{t("openaiCodex.expiresIn", { time: formatDuration(remainingMs) })}</span>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              {!status.connected ? (
                <Button type="button" onClick={() => void startConnection()} disabled={!status.configured || starting || Boolean(flow)}>
                  {starting ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Bot data-icon="inline-start" />}
                  {t("openaiCodex.connect")}
                </Button>
              ) : canDisconnect ? (
                <Button type="button" variant="outline" onClick={() => void disconnect()} disabled={disconnecting}>
                  {disconnecting ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Unplug data-icon="inline-start" />}
                  {t("openaiCodex.disconnect")}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ConnectionDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-secondary/45 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-sm text-foreground" dir="auto">{value}</p>
    </div>
  );
}

function openAICodexErrorMessage(
  error: unknown,
  t: OpenAICodexTranslator,
  fallbackKey: OpenAICodexTranslationKey = "common.failed"
) {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  const normalizedMessage = message.trim();
  if (!normalizedMessage) return t(fallbackKey);

  const rule = errorTranslationRules.find((candidate) => normalizedMessage.includes(candidate.match));
  return rule ? t(rule.key) : normalizedMessage;
}

function formatSource(source: string, t: OpenAICodexTranslator) {
  if (source === "stored_oauth") return t("openaiCodex.sourceStored");
  if (source === "env_access_token") return t("openaiCodex.sourceEnv");
  return source.replaceAll("_", " ");
}

function formatDuration(valueMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(valueMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
