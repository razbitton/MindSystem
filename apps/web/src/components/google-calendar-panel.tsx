"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DateSelectArg,
  DatesSetArg,
  EventApi,
  EventClickArg,
  EventDropArg,
  EventInput,
  EventSourceFuncArg
} from "@fullcalendar/core";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Unplug
} from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost, type AnyRecord } from "../lib/api";
import {
  cachedApiGet,
  invalidateCachedQueries
} from "../lib/query-cache";
import { addLocalDays, fromDateTimeInput, toDateTimeInput, toLocalDateString } from "../lib/view-models";
import { ConfirmDialog } from "./confirm-dialog";
import { Drawer } from "./page";
import { useI18n } from "../i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type SendUpdates = "all" | "externalOnly" | "none";

type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  googleAccountEmail: string | null;
  selectedCalendarIds: string[];
  scopes: string[];
};

type GoogleCalendarListEntry = {
  id: string;
  summary: string;
  description: string;
  primary: boolean;
  accessRole: string;
  writable: boolean;
  backgroundColor: string;
  foregroundColor: string;
  timeZone: string;
  selected: boolean;
};

type GoogleCalendarListResponse = {
  calendars: GoogleCalendarListEntry[];
  selectedCalendarIds: string[];
};

type GoogleCalendarAttendee = {
  email: string;
  displayName?: string;
  responseStatus?: string;
  optional?: boolean;
  self?: boolean;
  organizer?: boolean;
};

type GoogleCalendarEventProps = {
  eventId: string;
  calendarId: string;
  calendarSummary: string | null;
  description: string;
  location: string;
  attendees: GoogleCalendarAttendee[];
  htmlLink: string;
  status: string;
  eventType: string;
  recurringEventId: string;
  originalStartTime: unknown;
  creator: unknown;
  organizer: unknown;
  canEdit: boolean;
};

type GoogleCalendarApiEvent = {
  id: string;
  eventId: string;
  calendarId: string;
  calendarSummary: string | null;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  editable: boolean;
  canEdit: boolean;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps: GoogleCalendarEventProps;
};

type EventEditorState = {
  mode: "create" | "edit";
  eventId: string;
  canEdit: boolean;
  calendarId: string;
  calendarSummary: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string;
  attendeesText: string;
  sendUpdates: SendUpdates;
  htmlLink: string;
};

const googleCalendarCachePrefix = "GET /api/google-calendar";
const attendeeSplitPattern = /[\s,;]+/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function GoogleCalendarPanel({ className }: { className?: string } = {}) {
  const { t, direction, locale } = useI18n();
  const calendarRef = useRef<FullCalendar | null>(null);
  const timeZone = useMemo(() => resolvedTimeZone(), []);
  const [calendarTitle, setCalendarTitle] = useState("");
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [editor, setEditor] = useState<EventEditorState | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EventEditorState | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedCalendarIdsKey = selectedCalendarIds.join(",");
  const selectedCalendarSet = useMemo(() => new Set(selectedCalendarIds), [selectedCalendarIdsKey]);
  const defaultWritableCalendar = useMemo(() => {
    return (
      calendars.find((calendar) => selectedCalendarSet.has(calendar.id) && calendar.writable) ??
      calendars.find((calendar) => calendar.writable) ??
      null
    );
  }, [calendars, selectedCalendarSet]);

  async function loadGoogleCalendar(force = false) {
    setError(null);
    setLoading(true);
    setCalendarLoading(true);
    try {
      const nextStatus = await cachedApiGet<GoogleCalendarStatus>("/api/google-calendar/status", undefined, { force });
      setStatus(nextStatus);

      if (nextStatus.configured && nextStatus.connected) {
        const calendarData = await cachedApiGet<GoogleCalendarListResponse>("/api/google-calendar/calendars", undefined, { force });
        setCalendars(calendarData.calendars);
        setSelectedCalendarIds(calendarData.selectedCalendarIds);
      } else {
        setCalendars([]);
        setSelectedCalendarIds(nextStatus.selectedCalendarIds ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("googleCalendar.loadError"));
    } finally {
      setLoading(false);
      setCalendarLoading(false);
    }
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("googleCalendar");
    if (!result) return;

    if (result === "connected") {
      toast.success(t("googleCalendar.connected"));
    } else if (result === "error") {
      toast.error(url.searchParams.get("message") || t("googleCalendar.connectError"));
    }

    url.searchParams.delete("googleCalendar");
    url.searchParams.delete("message");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [t]);

  useEffect(() => {
    void loadGoogleCalendar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    calendarRef.current?.getApi().refetchEvents();
  }, [selectedCalendarIdsKey]);

  const loadCalendarEvents = useCallback(async (fetchInfo: EventSourceFuncArg): Promise<EventInput[]> => {
    if (!status?.connected || !selectedCalendarIdsKey) return [];

    try {
      const data = await apiGet<{ events: GoogleCalendarApiEvent[] }>("/api/google-calendar/events", {
        timeMin: fetchInfo.start.toISOString(),
        timeMax: fetchInfo.end.toISOString(),
        timeZone,
        calendarIds: selectedCalendarIdsKey
      });
      return data.events.map(mapApiEventToFullCalendar);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("googleCalendar.loadError"));
      return [];
    }
  }, [selectedCalendarIdsKey, status?.connected, t, timeZone]);

  async function refreshGoogleCalendar() {
    invalidateGoogleCalendarCache();
    await loadGoogleCalendar(true);
    calendarRef.current?.getApi().refetchEvents();
  }

  async function connectGoogleCalendar() {
    setConnecting(true);
    try {
      const response = await apiPost<{ authorizationUrl: string }>("/api/google-calendar/connect", {});
      window.location.assign(response.authorizationUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("googleCalendar.connectFailed"));
      setConnecting(false);
    }
  }

  async function disconnectGoogleCalendar() {
    setDisconnecting(true);
    try {
      await apiPost("/api/google-calendar/disconnect", {});
      invalidateGoogleCalendarCache();
      setEditor(null);
      setDeleteTarget(null);
      toast.success(t("googleCalendar.disconnected"));
      await loadGoogleCalendar(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
    } finally {
      setDisconnecting(false);
    }
  }

  async function toggleCalendar(calendarId: string, checked: boolean) {
    const previous = selectedCalendarIds;
    const next = checked
      ? Array.from(new Set([...selectedCalendarIds, calendarId]))
      : selectedCalendarIds.filter((id) => id !== calendarId);

    setSelectedCalendarIds(next);
    setSavingPreferences(true);
    try {
      await apiPatch("/api/google-calendar/preferences", { selectedCalendarIds: next });
      invalidateGoogleCalendarCache();
    } catch (err) {
      setSelectedCalendarIds(previous);
      toast.error(err instanceof Error ? err.message : t("googleCalendar.preferencesFailed"));
    } finally {
      setSavingPreferences(false);
    }
  }

  function openCreateEditor() {
    if (!defaultWritableCalendar) {
      toast.error(t("googleCalendar.noCalendars"));
      return;
    }

    const start = roundedNextHalfHour();
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setEditor({
      mode: "create",
      eventId: "",
      canEdit: true,
      calendarId: defaultWritableCalendar.id,
      calendarSummary: defaultWritableCalendar.summary,
      summary: "",
      description: "",
      location: "",
      start: toDateTimeInput(start.toISOString()),
      end: toDateTimeInput(end.toISOString()),
      allDay: false,
      timeZone,
      attendeesText: "",
      sendUpdates: "all",
      htmlLink: ""
    });
  }

  function handleDateSelect(selection: DateSelectArg) {
    calendarRef.current?.getApi().unselect();
    if (!defaultWritableCalendar) {
      toast.error(t("googleCalendar.noCalendars"));
      return;
    }

    setEditor(editorStateFromSelection(selection, defaultWritableCalendar, timeZone));
  }

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    setEditor(editorStateFromEvent(info.event, timeZone));
  }

  async function handleEventDrop(info: EventDropArg) {
    await patchMovedEvent(info.event, info.revert);
  }

  async function handleEventResize(info: EventResizeDoneArg) {
    await patchMovedEvent(info.event, info.revert);
  }

  async function patchMovedEvent(event: EventApi, revert: () => void) {
    const props = event.extendedProps as GoogleCalendarEventProps;
    if (!props.canEdit || !props.eventId || !event.start) {
      revert();
      toast.error(t("googleCalendar.readOnlyEvent"));
      return;
    }

    try {
      await apiPatch(`/api/google-calendar/events/${encodeURIComponent(props.eventId)}`, movedEventPayload(event, props, timeZone));
      invalidateGoogleCalendarCache();
      toast.success(t("googleCalendar.moved"));
      calendarRef.current?.getApi().refetchEvents();
    } catch (err) {
      revert();
      toast.error(err instanceof Error ? err.message : t("common.failed"));
    }
  }

  function updateEditor(patch: Partial<EventEditorState>) {
    setEditor((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (
        patch.attendeesText !== undefined &&
        current.sendUpdates === "none" &&
        parseAttendeeCandidates(patch.attendeesText).length
      ) {
        next.sendUpdates = "all";
      }
      return next;
    });
  }

  async function saveEditor() {
    if (!editor || !editor.canEdit) return;
    setSavingEvent(true);
    try {
      const payload = editorPayload(editor, timeZone, t);
      if (editor.mode === "edit") {
        await apiPatch(`/api/google-calendar/events/${encodeURIComponent(editor.eventId)}`, payload);
      } else {
        await apiPost("/api/google-calendar/events", payload);
      }

      invalidateGoogleCalendarCache();
      setEditor(null);
      toast.success(t("googleCalendar.saved"));
      calendarRef.current?.getApi().refetchEvents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
    } finally {
      setSavingEvent(false);
    }
  }

  async function deleteSelectedEvent() {
    if (!deleteTarget?.eventId) return;
    setDeleting(true);
    try {
      const params = new URLSearchParams({
        calendarId: deleteTarget.calendarId,
        sendUpdates: deleteTarget.sendUpdates
      });
      await apiDelete(`/api/google-calendar/events/${encodeURIComponent(deleteTarget.eventId)}?${params.toString()}`);
      invalidateGoogleCalendarCache();
      setDeleteTarget(null);
      setEditor((current) => current?.eventId === deleteTarget.eventId ? null : current);
      toast.success(t("googleCalendar.deleted"));
      calendarRef.current?.getApi().refetchEvents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
    } finally {
      setDeleting(false);
    }
  }

  function navigateCalendar(action: "prev" | "next" | "today") {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (action === "prev") api.prev();
    if (action === "next") api.next();
    if (action === "today") api.today();
  }

  function handleDatesSet(arg: DatesSetArg) {
    setCalendarTitle(new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
      day: "numeric",
      month: "long",
      weekday: "short"
    }).format(arg.start));
  }

  return (
    <section
      className={cn(
        "google-calendar-panel flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900 text-slate-200 shadow-sm",
        className
      )}
    >
      <div className="flex shrink-0 flex-col gap-3 border-b border-slate-800/60 bg-slate-800/20 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-300">
            <CalendarDays className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-medium text-slate-100" dir="auto">
              {calendarTitle || t("googleCalendar.title")}
            </h2>
            {status?.connected ? (
              <p className="truncate text-xs text-slate-500" dir="auto">
                {t("googleCalendar.connectedAs", {
                  email: status.googleAccountEmail ?? "Google"
                })}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {status?.connected ? (
            <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-1">
              <button
                type="button"
                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                onClick={() => navigateCalendar("prev")}
                aria-label="Previous day"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                className="px-3 text-sm font-medium text-slate-300 transition-colors hover:text-slate-100"
                onClick={() => navigateCalendar("today")}
              >
                {t("dashboard.today")}
              </button>
              <button
                type="button"
                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                onClick={() => navigateCalendar("next")}
                aria-label="Next day"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          ) : null}

          {status?.connected ? (
            <>
              <Button type="button" size="sm" onClick={openCreateEditor} disabled={!defaultWritableCalendar}>
                <Plus data-icon="inline-start" />
                {t("googleCalendar.newEvent")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void refreshGoogleCalendar()}
                disabled={loading || calendarLoading}
                title={t("googleCalendar.refreshCalendars")}
                aria-label={t("googleCalendar.refreshCalendars")}
                className="text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <RefreshCw className={cn("size-[18px]", calendarLoading && "animate-spin")} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void disconnectGoogleCalendar()}
                disabled={disconnecting}
                title={t("googleCalendar.disconnect")}
                aria-label={t("googleCalendar.disconnect")}
                className="text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                {disconnecting ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : <Unplug className="size-[18px]" aria-hidden />}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <CalendarPanelState>
            <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
            {t("common.loading")}
          </CalendarPanelState>
        ) : error ? (
          <CalendarPanelState tone="error">{error}</CalendarPanelState>
        ) : !status?.configured ? (
          <CalendarPanelState
            title={t("googleCalendar.notConfigured")}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => void refreshGoogleCalendar()}>
                <RefreshCw data-icon="inline-start" />
                {t("common.refresh")}
              </Button>
            }
          >
            {t("googleCalendar.configureHelp")}
          </CalendarPanelState>
        ) : !status.connected ? (
          <CalendarPanelState
            title={t("googleCalendar.notConnected")}
            action={
              <Button type="button" onClick={() => void connectGoogleCalendar()} disabled={connecting}>
                {connecting ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <CalendarDays data-icon="inline-start" />}
                {t("googleCalendar.connect")}
              </Button>
            }
          >
            {t("googleCalendar.subtitle")}
          </CalendarPanelState>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-slate-800/60 p-3">
              <CalendarToggleList
                calendars={calendars}
                selectedCalendarSet={selectedCalendarSet}
                saving={savingPreferences}
                onToggle={toggleCalendar}
              />
              {!selectedCalendarIds.length ? (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-400">
                  {t("googleCalendar.noSelectedCalendars")}
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-900/50 p-4">
              <div className="min-h-[760px] overflow-hidden rounded-lg border border-slate-800/60 bg-slate-950/20">
                <FullCalendar
                  ref={calendarRef}
                  plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
                  initialView="timeGridDay"
                  headerToolbar={false}
                  direction={direction}
                  firstDay={1}
                  nowIndicator
                  selectable={Boolean(defaultWritableCalendar)}
                  selectMirror
                  editable={Boolean(defaultWritableCalendar)}
                  eventStartEditable
                  eventDurationEditable
                  dayHeaders={false}
                  allDaySlot={false}
                  height="100%"
                  contentHeight="auto"
                  slotMinTime="08:00:00"
                  slotMaxTime="23:00:00"
                  slotDuration="00:30:00"
                  slotLabelFormat={{
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false
                  }}
                  events={loadCalendarEvents}
                  datesSet={handleDatesSet}
                  select={handleDateSelect}
                  eventClick={handleEventClick}
                  eventDrop={(info) => void handleEventDrop(info)}
                  eventResize={(info) => void handleEventResize(info)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <GoogleCalendarEventEditor
        editor={editor}
        calendars={calendars}
        saving={savingEvent}
        onChange={updateEditor}
        onClose={() => setEditor(null)}
        onSave={() => void saveEditor()}
        onDelete={() => {
          if (editor) setDeleteTarget(editor);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("googleCalendar.deleteEvent")}
        description={t("googleCalendar.deleteConfirm", {
          title: deleteTarget?.summary || t("googleCalendar.newEvent")
        })}
        confirmLabel={deleting ? t("common.deleting") : t("common.delete")}
        destructive
        loading={deleting}
        onConfirm={() => void deleteSelectedEvent()}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      />
    </section>
  );
}

function CalendarPanelState({
  title,
  children,
  action,
  tone = "default"
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div className="flex min-h-72 flex-1 items-center justify-center p-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        {title ? (
          <p className={cn("text-sm font-medium", tone === "error" ? "text-red-300" : "text-slate-100")} dir="auto">
            {title}
          </p>
        ) : null}
        <div className={cn("flex items-center text-sm leading-relaxed", tone === "error" ? "text-red-300" : "text-slate-400")} dir="auto">
          {children}
        </div>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  );
}

function CalendarToggleList({
  calendars,
  selectedCalendarSet,
  saving,
  onToggle
}: {
  calendars: GoogleCalendarListEntry[];
  selectedCalendarSet: Set<string>;
  saving: boolean;
  onToggle: (calendarId: string, checked: boolean) => void | Promise<void>;
}) {
  const { t } = useI18n();

  if (!calendars.length) {
    return <p className="text-sm text-slate-500">{t("googleCalendar.noCalendars")}</p>;
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-2" aria-label={t("googleCalendar.calendars")}>
      {calendars.map((calendar) => {
        const checked = selectedCalendarSet.has(calendar.id);
        return (
          <label
            key={calendar.id}
            className={cn(
              "flex max-w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-2 text-xs text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200",
              checked && "border-indigo-500/35 bg-indigo-500/10 text-slate-200"
            )}
          >
            <Checkbox
              checked={checked}
              disabled={saving}
              aria-label={t("googleCalendar.showCalendar", { name: calendar.summary })}
              onCheckedChange={(value) => void onToggle(calendar.id, value === true)}
            />
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: calendar.backgroundColor || "#818cf8" }}
              aria-hidden
            />
            <span className="min-w-0 truncate" dir="auto">{calendar.summary}</span>
            {!calendar.writable ? (
              <span className="shrink-0 rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                {t("googleCalendar.readOnly")}
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}

function GoogleCalendarEventEditor({
  editor,
  calendars,
  saving,
  onChange,
  onClose,
  onSave,
  onDelete
}: {
  editor: EventEditorState | null;
  calendars: GoogleCalendarListEntry[];
  saving: boolean;
  onChange: (patch: Partial<EventEditorState>) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const editable = Boolean(editor?.canEdit);
  const calendarOptions = editor?.mode === "create"
    ? calendars.filter((calendar) => calendar.writable)
    : calendars;

  return (
    <Drawer
      open={Boolean(editor)}
      title={editor?.mode === "edit" ? t("googleCalendar.editEvent") : t("googleCalendar.newEvent")}
      onClose={onClose}
      footer={
        editor ? (
          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {editor.htmlLink ? (
                <Button type="button" variant="ghost" size="sm" asChild>
                  <a href={editor.htmlLink} target="_blank" rel="noreferrer">
                    <ExternalLink data-icon="inline-start" />
                    {t("googleCalendar.openInGoogle")}
                  </a>
                </Button>
              ) : null}
              {editor.mode === "edit" && editor.canEdit ? (
                <Button type="button" variant="delete" size="sm" onClick={onDelete} disabled={saving}>
                  <Trash2 data-icon="inline-start" />
                  {t("common.delete")}
                </Button>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={onSave} disabled={!editable || saving}>
                {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                {t("common.save")}
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      {editor ? (
        <div className="flex min-w-0 flex-col gap-4">
          {!editable ? (
            <Alert>
              <AlertDescription>{t("googleCalendar.readOnlyEvent")}</AlertDescription>
            </Alert>
          ) : null}

          <Field label={t("googleCalendar.summary")}>
            <Input
              value={editor.summary}
              onChange={(event) => onChange({ summary: event.target.value })}
              disabled={!editable}
              placeholder={t("googleCalendar.summaryPlaceholder")}
              dir="auto"
            />
          </Field>

          <Field label={t("googleCalendar.calendar")}>
            <Select
              value={editor.calendarId}
              onValueChange={(calendarId) => {
                const calendar = calendars.find((item) => item.id === calendarId);
                onChange({
                  calendarId,
                  calendarSummary: calendar?.summary ?? editor.calendarSummary
                });
              }}
              disabled={!editable || editor.mode === "edit"}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {calendarOptions.map((calendar) => (
                  <SelectItem key={calendar.id} value={calendar.id}>
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: calendar.backgroundColor || "var(--primary)" }}
                        aria-hidden
                      />
                      <span className="truncate" dir="auto">{calendar.summary}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="flex items-center gap-2">
            <Switch
              id="google-calendar-all-day"
              checked={editor.allDay}
              disabled={!editable}
              onCheckedChange={(checked) => onChange(convertAllDay(editor, checked === true))}
            />
            <Label htmlFor="google-calendar-all-day">{t("googleCalendar.allDay")}</Label>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field label={t("googleCalendar.start")}>
              <Input
                type={editor.allDay ? "date" : "datetime-local"}
                value={editor.start}
                onChange={(event) => onChange({ start: event.target.value })}
                disabled={!editable}
              />
            </Field>
            <Field label={t("googleCalendar.end")}>
              <Input
                type={editor.allDay ? "date" : "datetime-local"}
                value={editor.end}
                onChange={(event) => onChange({ end: event.target.value })}
                disabled={!editable}
              />
            </Field>
          </div>

          <Field label={t("googleCalendar.location")}>
            <Input
              value={editor.location}
              onChange={(event) => onChange({ location: event.target.value })}
              disabled={!editable}
              placeholder={t("googleCalendar.locationPlaceholder")}
              dir="auto"
            />
          </Field>

          <Field label={t("googleCalendar.description")}>
            <Textarea
              value={editor.description}
              onChange={(event) => onChange({ description: event.target.value })}
              disabled={!editable}
              placeholder={t("googleCalendar.descriptionPlaceholder")}
              rows={4}
              dir="auto"
            />
          </Field>

          <Field label={t("googleCalendar.attendees")}>
            <Textarea
              value={editor.attendeesText}
              onChange={(event) => onChange({ attendeesText: event.target.value })}
              disabled={!editable}
              placeholder={t("googleCalendar.attendeesPlaceholder")}
              rows={3}
              dir="ltr"
            />
          </Field>

          <Field label={t("googleCalendar.sendUpdates")}>
            <Select
              value={editor.sendUpdates}
              onValueChange={(sendUpdates) => onChange({ sendUpdates: sendUpdates as SendUpdates })}
              disabled={!editable}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("googleCalendar.sendUpdatesAll")}</SelectItem>
                <SelectItem value="externalOnly">{t("googleCalendar.sendUpdatesExternalOnly")}</SelectItem>
                <SelectItem value="none">{t("googleCalendar.sendUpdatesNone")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : null}
    </Drawer>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function mapApiEventToFullCalendar(event: GoogleCalendarApiEvent): EventInput {
  const input: EventInput = {
    id: event.id,
    title: event.title,
    allDay: event.allDay,
    editable: event.editable,
    extendedProps: {
      ...event.extendedProps,
      eventId: event.eventId,
      calendarId: event.calendarId,
      calendarSummary: event.calendarSummary,
      canEdit: event.canEdit
    }
  };

  if (event.start) input.start = event.start;
  if (event.end) input.end = event.end;
  if (event.backgroundColor) input.backgroundColor = event.backgroundColor;
  const borderColor = event.borderColor || event.backgroundColor;
  if (borderColor) input.borderColor = borderColor;
  if (event.textColor) input.textColor = event.textColor;

  return input;
}

function editorStateFromSelection(
  selection: DateSelectArg,
  calendar: GoogleCalendarListEntry,
  timeZone: string
): EventEditorState {
  if (selection.allDay) {
    const start = selection.startStr.slice(0, 10);
    const end = selection.endStr?.slice(0, 10) || toLocalDateString(addLocalDays(selection.start, 1));
    return {
      mode: "create",
      eventId: "",
      canEdit: true,
      calendarId: calendar.id,
      calendarSummary: calendar.summary,
      summary: "",
      description: "",
      location: "",
      start,
      end: end > start ? end : toLocalDateString(addLocalDays(selection.start, 1)),
      allDay: true,
      timeZone,
      attendeesText: "",
      sendUpdates: "all",
      htmlLink: ""
    };
  }

  const start = selection.start;
  const end = selection.end ?? new Date(start.getTime() + 60 * 60 * 1000);
  return {
    mode: "create",
    eventId: "",
    canEdit: true,
    calendarId: calendar.id,
    calendarSummary: calendar.summary,
    summary: "",
    description: "",
    location: "",
    start: toDateTimeInput(start.toISOString()),
    end: toDateTimeInput(end.toISOString()),
    allDay: false,
    timeZone,
    attendeesText: "",
    sendUpdates: "all",
    htmlLink: ""
  };
}

function editorStateFromEvent(event: EventApi, timeZone: string): EventEditorState {
  const props = event.extendedProps as GoogleCalendarEventProps;
  const start = event.start ?? new Date();
  const end = event.end ?? new Date(start.getTime() + 60 * 60 * 1000);
  const attendees = (props.attendees ?? []).map((attendee) => attendee.email).filter(Boolean).join(", ");
  const hasAttendees = Boolean(attendees);

  return {
    mode: "edit",
    eventId: props.eventId,
    canEdit: Boolean(props.canEdit),
    calendarId: props.calendarId,
    calendarSummary: props.calendarSummary ?? "",
    summary: event.title,
    description: props.description ?? "",
    location: props.location ?? "",
    start: event.allDay ? dateFromEventString(event.startStr, start) : toDateTimeInput(start.toISOString()),
    end: event.allDay ? endDateFromEvent(event, start) : toDateTimeInput(end.toISOString()),
    allDay: event.allDay,
    timeZone,
    attendeesText: attendees,
    sendUpdates: hasAttendees ? "all" : "none",
    htmlLink: props.htmlLink ?? ""
  };
}

function movedEventPayload(event: EventApi, props: GoogleCalendarEventProps, timeZone: string): AnyRecord {
  const start = event.start ?? new Date();
  const end = event.end ?? new Date(start.getTime() + 60 * 60 * 1000);
  const hasAttendees = Boolean((props.attendees ?? []).some((attendee) => attendee.email));

  if (event.allDay) {
    return {
      calendarId: props.calendarId,
      start: dateFromEventString(event.startStr, start),
      end: endDateFromEvent(event, start),
      allDay: true,
      sendUpdates: hasAttendees ? "all" : "none"
    };
  }

  return {
    calendarId: props.calendarId,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    timeZone,
    sendUpdates: hasAttendees ? "all" : "none"
  };
}

function editorPayload(editor: EventEditorState, timeZone: string, t: (key: Parameters<ReturnType<typeof useI18n>["t"]>[0]) => string): AnyRecord {
  const summary = editor.summary.trim();
  if (!summary || !editor.start || !editor.end) throw new Error(t("googleCalendar.eventRequired"));

  const attendees = parseAttendees(editor.attendeesText, t);
  const base = {
    calendarId: editor.calendarId,
    summary,
    description: editor.description.trim() || null,
    location: editor.location.trim() || null,
    attendees,
    sendUpdates: editor.sendUpdates
  };

  if (editor.allDay) {
    if (editor.end <= editor.start) throw new Error(t("googleCalendar.endAfterStart"));
    return {
      ...base,
      start: editor.start,
      end: editor.end,
      allDay: true
    };
  }

  const start = fromDateTimeInput(editor.start);
  const end = fromDateTimeInput(editor.end);
  if (!start || !end) throw new Error(t("googleCalendar.eventRequired"));
  if (new Date(start) >= new Date(end)) throw new Error(t("googleCalendar.endAfterStart"));

  return {
    ...base,
    start,
    end,
    allDay: false,
    timeZone
  };
}

function parseAttendees(text: string, t: (key: Parameters<ReturnType<typeof useI18n>["t"]>[0]) => string) {
  const candidates = parseAttendeeCandidates(text);
  if (candidates.some((email) => !emailPattern.test(email))) {
    throw new Error(t("googleCalendar.invalidAttendee"));
  }
  return candidates.map((email) => ({ email }));
}

function parseAttendeeCandidates(text: string) {
  return Array.from(
    new Set(
      text
        .split(attendeeSplitPattern)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function convertAllDay(editor: EventEditorState, allDay: boolean): Partial<EventEditorState> {
  if (allDay === editor.allDay) return { allDay };

  if (allDay) {
    const start = editor.start.slice(0, 10) || toLocalDateString();
    const endDate = editor.end.slice(0, 10);
    const end = endDate > start ? endDate : toLocalDateString(addLocalDays(new Date(`${start}T00:00:00`), 1));
    return { allDay: true, start, end };
  }

  const startDate = editor.start.slice(0, 10) || toLocalDateString();
  return {
    allDay: false,
    start: `${startDate}T09:00`,
    end: `${startDate}T10:00`
  };
}

function dateFromEventString(value: string, fallback: Date) {
  return value ? value.slice(0, 10) : toLocalDateString(fallback);
}

function endDateFromEvent(event: EventApi, start: Date) {
  return event.endStr ? event.endStr.slice(0, 10) : toLocalDateString(addLocalDays(start, 1));
}

function roundedNextHalfHour() {
  const date = new Date();
  date.setSeconds(0, 0);
  const minutes = date.getMinutes();
  const roundedMinutes = minutes <= 30 ? 30 : 60;
  if (roundedMinutes === 60) {
    date.setHours(date.getHours() + 1, 0);
  } else {
    date.setMinutes(roundedMinutes);
  }
  return date;
}

function resolvedTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function invalidateGoogleCalendarCache() {
  invalidateCachedQueries(googleCalendarCachePrefix);
}
