"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, CalendarClock, Loader2, Play, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../i18n";
import { apiPatch, apiPost, type AnyRecord } from "../lib/api";
import { cachedApiGet, invalidateCachedQueries, peekCachedQuery } from "../lib/query-cache";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const aiProcessingCachePrefix = "GET /api/admin/ai-processing";

type AiProcessingRun = AnyRecord & {
  id: string;
  status: string;
  dryRun: boolean;
  totalCount: number;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  reviewCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
};

type AiProcessingSchedule = AnyRecord & {
  enabled: boolean;
  intervalMinutes: number;
  limitCount: number;
  batchSize: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
};

export function AiProcessingPanel() {
  const { t, formatDate } = useI18n();
  const [runs, setRuns] = useState<AiProcessingRun[]>(
    () => peekCachedQuery<{ runs: AiProcessingRun[] }>("/api/admin/ai-processing/runs")?.runs ?? []
  );
  const [schedule, setSchedule] = useState<AiProcessingSchedule | null>(
    () => peekCachedQuery<{ schedule: AiProcessingSchedule }>("/api/admin/ai-processing/schedule")?.schedule ?? null
  );
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backfillLimit, setBackfillLimit] = useState("500");
  const [backfillDryRun, setBackfillDryRun] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState("1440");
  const [scheduleLimit, setScheduleLimit] = useState("100");
  const [scheduleDryRun, setScheduleDryRun] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const [runData, scheduleData] = await Promise.all([
        cachedApiGet<{ runs: AiProcessingRun[] }>("/api/admin/ai-processing/runs", undefined, { force }),
        cachedApiGet<{ schedule: AiProcessingSchedule }>("/api/admin/ai-processing/schedule", undefined, { force })
      ]);
      setRuns(runData.runs);
      setSchedule(scheduleData.schedule);
      setScheduleEnabled(Boolean(scheduleData.schedule.enabled));
      setScheduleInterval(String(scheduleData.schedule.intervalMinutes ?? 1440));
      setScheduleLimit(String(scheduleData.schedule.limitCount ?? 100));
      setScheduleDryRun(Boolean(scheduleData.schedule.dryRun));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("aiProcessing.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startBackfill() {
    setStarting(true);
    try {
      await apiPost("/api/admin/ai-processing/backfill", {
        limit: boundedNumber(backfillLimit, 1, 10000, 500),
        batchSize: 25,
        onlyUnprocessed: true,
        dryRun: backfillDryRun
      });
      invalidateCachedQueries(aiProcessingCachePrefix);
      toast.success(t("aiProcessing.backfillQueued"));
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("aiProcessing.backfillFailed"));
    } finally {
      setStarting(false);
    }
  }

  async function saveSchedule() {
    setSaving(true);
    try {
      await apiPatch("/api/admin/ai-processing/schedule", {
        enabled: scheduleEnabled,
        intervalMinutes: boundedNumber(scheduleInterval, 15, 10080, 1440),
        limit: boundedNumber(scheduleLimit, 1, 1000, 100),
        batchSize: 25,
        onlyUnprocessed: true,
        dryRun: scheduleDryRun
      });
      invalidateCachedQueries(aiProcessingCachePrefix);
      toast.success(t("aiProcessing.scheduleSaved"));
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.failed"));
    } finally {
      setSaving(false);
    }
  }

  const latest = runs[0];

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex min-w-0 items-center gap-2">
            <Bot className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{t("aiProcessing.title")}</span>
          </CardTitle>
          <CardDescription>{t("aiProcessing.subtitle")}</CardDescription>
        </div>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => void load(true)}
            disabled={loading}
            title={t("common.refresh")}
            aria-label={t("common.refresh")}
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} aria-hidden />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-lg border border-border p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t("aiProcessing.backfillTitle")}</p>
                <p className="text-sm text-muted-foreground">{t("aiProcessing.backfillBody")}</p>
              </div>
              <Badge variant={backfillDryRun ? "warning" : "outline"}>{backfillDryRun ? t("aiProcessing.dryRun") : t("aiProcessing.apply")}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ai-backfill-limit">{t("aiProcessing.limit")}</Label>
                <Input
                  id="ai-backfill-limit"
                  inputMode="numeric"
                  value={backfillLimit}
                  onChange={(event) => setBackfillLimit(event.target.value)}
                />
              </div>
              <label className="flex items-end gap-3 rounded-md border border-border px-3 py-2">
                <Switch checked={backfillDryRun} onCheckedChange={setBackfillDryRun} />
                <span className="text-sm text-foreground">{t("aiProcessing.dryRun")}</span>
              </label>
            </div>

            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => void startBackfill()} disabled={starting}>
                {starting ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Play data-icon="inline-start" />}
                {t("aiProcessing.startBackfill")}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t("aiProcessing.scheduleTitle")}</p>
                <p className="text-sm text-muted-foreground">{t("aiProcessing.scheduleBody")}</p>
              </div>
              <Badge variant={scheduleEnabled ? "success" : "muted"}>{scheduleEnabled ? t("aiProcessing.enabled") : t("aiProcessing.disabled")}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
                <span className="text-sm text-foreground">{t("aiProcessing.enabled")}</span>
              </label>
              <label className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                <Switch checked={scheduleDryRun} onCheckedChange={setScheduleDryRun} />
                <span className="text-sm text-foreground">{t("aiProcessing.dryRun")}</span>
              </label>
              <div className="grid gap-2">
                <Label htmlFor="ai-schedule-interval">{t("aiProcessing.intervalMinutes")}</Label>
                <Input
                  id="ai-schedule-interval"
                  inputMode="numeric"
                  value={scheduleInterval}
                  onChange={(event) => setScheduleInterval(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ai-schedule-limit">{t("aiProcessing.limit")}</Label>
                <Input
                  id="ai-schedule-limit"
                  inputMode="numeric"
                  value={scheduleLimit}
                  onChange={(event) => setScheduleLimit(event.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {schedule?.nextRunAt ? t("aiProcessing.nextRun", { date: formatDate(schedule.nextRunAt) }) : t("aiProcessing.noNextRun")}
                </span>
              </p>
              <Button type="button" variant="outline" onClick={() => void saveSchedule()} disabled={saving}>
                {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
                {t("common.save")}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-foreground">{t("aiProcessing.recentRuns")}</p>
            {latest ? <Badge variant={statusVariant(latest.status)}>{latest.status}</Badge> : null}
          </div>
          {runs.length ? (
            <div className="divide-y divide-border">
              {runs.slice(0, 5).map((run) => (
                <div key={run.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                      {run.dryRun ? <Badge variant="warning">{t("aiProcessing.dryRun")}</Badge> : null}
                      <span className="text-xs text-muted-foreground">{formatDate(run.createdAt)}</span>
                    </div>
                    {run.error ? <p className="mt-1 truncate text-xs text-destructive">{run.error}</p> : null}
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-center text-xs">
                    <RunMetric label={t("aiProcessing.processed")} value={run.processedCount} />
                    <RunMetric label={t("aiProcessing.created")} value={run.createdCount} />
                    <RunMetric label={t("aiProcessing.updated")} value={run.updatedCount} />
                    <RunMetric label={t("aiProcessing.review")} value={run.reviewCount} />
                    <RunMetric label={t("aiProcessing.failed")} value={run.failedCount} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">{loading ? t("common.loading") : t("aiProcessing.noRuns")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RunMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-12 rounded-md bg-secondary/45 px-2 py-1">
      <p className="font-medium text-foreground">{value ?? 0}</p>
      <p className="truncate text-muted-foreground">{label}</p>
    </div>
  );
}

function boundedNumber(value: string, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function statusVariant(status: string): "default" | "success" | "warning" | "destructive" | "muted" | "outline" {
  if (status === "completed") return "success";
  if (status === "running" || status === "queued") return "warning";
  if (status === "failed") return "destructive";
  return "outline";
}
