"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import heLocale from "@fullcalendar/core/locales/he";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  EventContentArg,
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Filter,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
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

type CalendarScope = "day" | "week" | "month";
type CalendarPresentation = "calendar" | "agenda";
type CalendarView = "timeGridDay" | "timeGridWeek" | "dayGridMonth" | "listDay" | "listWeek" | "listMonth";

const googleCalendarCachePrefix = "GET /api/google-calendar";
const attendeeSplitPattern = /[\s,;]+/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const oneDayMs = 24 * 60 * 60 * 1000;
const calendarScopeOptions: CalendarScope[] = ["day", "week", "month"];
const calendarScopeShortcuts: Record<CalendarScope, string> = {
  day: "D",
  week: "W",
  month: "M"
};

export function GoogleCalendarPanel({ className }: { className?: string } = {}) {
  const { t, direction, locale } = useI18n();
  const calendarRef = useRef<FullCalendar | null>(null);
  const calendarFrameRef = useRef<HTMLDivElement | null>(null);
  const timeZone = useMemo(() => resolvedTimeZone(), []);
  const [calendarTitle, setCalendarTitle] = useState("");
  const [calendarScope, setCalendarScope] = useState<CalendarScope>("day");
  const [calendarPresentation, setCalendarPresentation] = useState<CalendarPresentation>("calendar");
  const [calendarDate, setCalendarDate] = useState(() => toLocalDateString());
  const [todayInCurrentRange, setTodayInCurrentRange] = useState(true);
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
  const calendarView = calendarScopeToView(calendarScope, calendarPresentation);
  const calendarScopeLabels: Record<CalendarScope, string> = {
    day: t("googleCalendar.viewDay"),
    week: t("googleCalendar.viewWeek"),
    month: t("googleCalendar.viewMonth")
  };

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

  useEffect(() => {
    if (!status?.connected || calendarPresentation !== "calendar" || calendarScope === "month") return;

    const timeout = window.setTimeout(() => {
      const frame = calendarFrameRef.current;
      if (!frame) return;

      frame.scrollTo({
        top: calendarWorkdayScrollTop(),
        behavior: "smooth"
      });
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [calendarDate, calendarPresentation, calendarScope, status?.connected]);

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

  function changeCalendarScope(scope: CalendarScope) {
    setCalendarScope(scope);
    calendarRef.current?.getApi().changeView(calendarScopeToView(scope, calendarPresentation));
  }

  function changeCalendarPresentation(presentation: CalendarPresentation) {
    setCalendarPresentation(presentation);
    calendarRef.current?.getApi().changeView(calendarScopeToView(calendarScope, presentation));
  }

  function jumpToDate(value: string) {
    if (!value) return;
    setCalendarDate(value);
    calendarRef.current?.getApi().gotoDate(value);
  }

  function handleDatesSet(arg: DatesSetArg) {
    const nextState = stateFromCalendarView(arg.view.type);
    if (nextState) {
      setCalendarScope(nextState.scope);
      setCalendarPresentation(nextState.presentation);
    }
    setCalendarDate(toLocalDateString(calendarRef.current?.getApi().getDate() ?? arg.view.currentStart ?? arg.start));
    setCalendarTitle(formatCalendarTitle(arg, locale));
    setTodayInCurrentRange(isTodayInRange(arg.start, arg.end));
  }

  return (
    <section
      className={cn(
        "google-calendar-panel bounded-surface flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs",
        className
      )}
    >
      <div className="shrink-0 border-b border-border p-3">
        {status?.connected ? (
          <div className="flex min-w-0 flex-col gap-3" dir={direction}>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="min-w-0 truncate rounded-md px-1 text-start text-lg font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    aria-label={t("googleCalendar.datePicker")}
                    dir="auto"
                  >
                    {calendarTitle || t("googleCalendar.title")}
                  </button>
                </PopoverTrigger>
                <PopoverContent align={direction === "rtl" ? "start" : "end"} className="w-auto p-3">
                  <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                    {t("googleCalendar.datePicker")}
                  </Label>
                  <Input
                    type="date"
                    value={calendarDate}
                    onInput={(event) => jumpToDate(event.currentTarget.value)}
                    onChange={(event) => jumpToDate(event.target.value)}
                    aria-label={t("googleCalendar.datePicker")}
                    className="w-[10rem]"
                  />
                </PopoverContent>
              </Popover>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigateCalendar("today")}
                  disabled={todayInCurrentRange}
                  title={t("googleCalendar.returnToToday")}
                  className="h-7 rounded-md border-border bg-secondary/70 px-2.5 text-xs"
                >
                  {t("googleCalendar.returnToToday")}
                </Button>

                <div className="flex h-7 overflow-hidden rounded-md border border-border bg-secondary/70">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => navigateCalendar("prev")}
                    aria-label={t("googleCalendar.previousRange")}
                    className="h-7 w-7 rounded-none text-muted-foreground hover:text-foreground"
                  >
                    {direction === "rtl" ? <ChevronRight className="size-3.5" aria-hidden /> : <ChevronLeft className="size-3.5" aria-hidden />}
                  </Button>
                  <div className="my-1.5 w-px bg-border" aria-hidden />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => navigateCalendar("next")}
                    aria-label={t("googleCalendar.nextRange")}
                    className="h-7 w-7 rounded-none text-muted-foreground hover:text-foreground"
                  >
                    {direction === "rtl" ? <ChevronLeft className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5">
              <Button
                type="button"
                size="sm"
                onClick={openCreateEditor}
                disabled={!defaultWritableCalendar}
                className="h-8 min-w-0 flex-1 justify-center rounded-lg px-3"
              >
                <Plus className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{t("googleCalendar.newEvent")}</span>
              </Button>

              <div
                className="flex h-8 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/70 p-0.5"
                role="group"
                aria-label={t("googleCalendar.displayMode")}
              >
                <button
                  type="button"
                  aria-pressed={calendarPresentation === "agenda"}
                  className={cn(
                    "flex w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                    calendarPresentation === "agenda" && "bg-primary text-primary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground"
                  )}
                  onClick={() => changeCalendarPresentation("agenda")}
                  title={t("googleCalendar.viewAgenda")}
                  aria-label={t("googleCalendar.viewAgenda")}
                >
                  <Clock3 className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-pressed={calendarPresentation === "calendar"}
                  className={cn(
                    "flex w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                    calendarPresentation === "calendar" && "bg-primary text-primary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground"
                  )}
                  onClick={() => changeCalendarPresentation("calendar")}
                  title={t("googleCalendar.viewCalendar")}
                  aria-label={t("googleCalendar.viewCalendar")}
                >
                  <CalendarDays className="size-4" aria-hidden />
                </button>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="h-8 w-8 shrink-0 rounded-lg bg-secondary/70"
                    title={t("common.filter")}
                    aria-label={t("common.filter")}
                  >
                    <Filter className="size-4" aria-hidden />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align={direction === "rtl" ? "start" : "end"} className="w-[min(22rem,calc(100vw-2rem))] p-0">
                  <div className="flex items-start justify-between gap-3 border-b border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{t("googleCalendar.filterCalendars")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("googleCalendar.filterSummary", {
                          selected: selectedCalendarIds.length,
                          total: calendars.length
                        })}
                      </p>
                    </div>
                    {savingPreferences ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden /> : null}
                  </div>
                  <div className="max-h-72 overflow-y-auto p-3">
                    <CalendarToggleList
                      calendars={calendars}
                      selectedCalendarSet={selectedCalendarSet}
                      saving={savingPreferences}
                      variant="panel"
                      onToggle={toggleCalendar}
                    />
                  </div>
                </PopoverContent>
              </Popover>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 rounded-lg border-border bg-secondary/70 px-2.5"
                  >
                    {calendarScopeLabels[calendarScope]}
                    <ChevronDown className="size-4 opacity-70" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={direction === "rtl" ? "start" : "end"} className="w-48 p-2">
                  {calendarScopeOptions.map((scope) => (
                    <DropdownMenuItem
                      key={scope}
                      className={cn(
                        "h-10 justify-between rounded-md font-medium",
                        calendarScope === scope && "bg-accent text-accent-foreground"
                      )}
                      onSelect={() => changeCalendarScope(scope)}
                    >
                      <span>{calendarScopeLabels[scope]}</span>
                      <DropdownMenuShortcut>{calendarScopeShortcuts[scope]}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => void refreshGoogleCalendar()}
                disabled={loading || calendarLoading}
                title={t("googleCalendar.refreshCalendars")}
                aria-label={t("googleCalendar.refreshCalendars")}
                className="h-8 w-8 shrink-0 rounded-lg bg-secondary/70 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={cn("size-[18px]", calendarLoading && "animate-spin")} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => void disconnectGoogleCalendar()}
                disabled={disconnecting}
                title={t("googleCalendar.disconnect")}
                aria-label={t("googleCalendar.disconnect")}
                className="h-8 w-8 shrink-0 rounded-lg bg-secondary/70 text-muted-foreground hover:text-foreground"
              >
                {disconnecting ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : <Unplug className="size-[18px]" aria-hidden />}
              </Button>
            </div>
          </div>
        ) : (
          <h2 className="text-sm font-medium text-foreground">{t("googleCalendar.title")}</h2>
        )}
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
            {!selectedCalendarIds.length ? (
              <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
                <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
                  {t("googleCalendar.noSelectedCalendars")}
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 bg-background/35 p-4 sm:p-5">
              <div
                ref={calendarFrameRef}
                className="calendar-frame h-[640px] min-h-[560px] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-background sm:h-[720px]"
              >
                <FullCalendar
                  ref={calendarRef}
                  plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
                  initialView={calendarView}
                  initialDate={calendarDate}
                  headerToolbar={false}
                  direction={direction}
                  locale={locale === "he" ? heLocale : "en"}
                  firstDay={1}
                  nowIndicator
                  selectable={Boolean(defaultWritableCalendar)}
                  selectMirror
                  editable={Boolean(defaultWritableCalendar)}
                  eventStartEditable
                  eventDurationEditable
                  dayHeaders={calendarPresentation === "calendar" && calendarScope !== "day"}
                  allDaySlot={calendarPresentation === "calendar" && calendarScope === "week"}
                  height="auto"
                  contentHeight="auto"
                  slotMinTime="08:00:00"
                  slotMaxTime="23:00:00"
                  slotDuration="00:30:00"
                  slotLabelFormat={{
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false
                  }}
                  eventTimeFormat={{
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false
                  }}
                  displayEventEnd
                  dayMaxEvents={3}
                  eventMaxStack={3}
                  events={loadCalendarEvents}
                  datesSet={handleDatesSet}
                  select={handleDateSelect}
                  eventClick={handleEventClick}
                  eventContent={renderCalendarEventContent}
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
          <p className={cn("text-sm font-medium", tone === "error" ? "text-destructive" : "text-foreground")} dir="auto">
            {title}
          </p>
        ) : null}
        <div className={cn("flex items-center text-sm leading-relaxed", tone === "error" ? "text-destructive" : "text-muted-foreground")} dir="auto">
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
  variant = "inline",
  onToggle
}: {
  calendars: GoogleCalendarListEntry[];
  selectedCalendarSet: Set<string>;
  saving: boolean;
  variant?: "inline" | "panel";
  onToggle: (calendarId: string, checked: boolean) => void | Promise<void>;
}) {
  const { t } = useI18n();

  if (!calendars.length) {
    return <p className="text-sm text-muted-foreground">{t("googleCalendar.noCalendars")}</p>;
  }

  return (
    <div
      className={cn(
        "min-w-0",
        variant === "panel" ? "flex flex-col gap-2" : "flex flex-wrap gap-2"
      )}
      aria-label={t("googleCalendar.calendars")}
    >
      {calendars.map((calendar) => {
        const checked = selectedCalendarSet.has(calendar.id);
        return (
          <label
            key={calendar.id}
            className={cn(
              "flex max-w-full items-center gap-2 rounded-lg border border-border bg-secondary/45 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground",
              variant === "panel" ? "w-full px-3" : "px-2.5",
              checked && "border-primary/35 bg-primary/10 text-foreground"
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
              style={{ backgroundColor: calendar.backgroundColor || "var(--primary)" }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate" dir="auto">{calendar.summary}</span>
            {!calendar.writable ? (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t("googleCalendar.readOnly")}
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}

function renderCalendarEventContent(arg: EventContentArg) {
  return (
    <div className="google-calendar-event-content" dir="auto">
      {arg.timeText ? (
        <span className="google-calendar-event-time" dir="ltr">
          {arg.timeText}
        </span>
      ) : null}
      <span className="google-calendar-event-title" dir="auto">
        {arg.event.title}
      </span>
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
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
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

function calendarScopeToView(scope: CalendarScope, presentation: CalendarPresentation): CalendarView {
  if (presentation === "agenda") {
    if (scope === "day") return "listDay";
    if (scope === "week") return "listWeek";
    return "listMonth";
  }

  if (scope === "day") return "timeGridDay";
  if (scope === "week") return "timeGridWeek";
  return "dayGridMonth";
}

function stateFromCalendarView(value: string): { scope: CalendarScope; presentation: CalendarPresentation } | null {
  if (value === "timeGridDay") return { scope: "day", presentation: "calendar" };
  if (value === "timeGridWeek") return { scope: "week", presentation: "calendar" };
  if (value === "dayGridMonth") return { scope: "month", presentation: "calendar" };
  if (value === "listDay") return { scope: "day", presentation: "agenda" };
  if (value === "listWeek") return { scope: "week", presentation: "agenda" };
  if (value === "listMonth") return { scope: "month", presentation: "agenda" };
  return null;
}

function formatCalendarTitle(arg: DatesSetArg, locale: string) {
  const intlLocale = locale === "he" ? "he-IL" : "en-US";
  const viewType = arg.view.type;

  if (viewType === "dayGridMonth" || viewType === "listMonth") {
    return new Intl.DateTimeFormat(intlLocale, {
      month: "long",
      year: "numeric"
    }).format(arg.view.currentStart);
  }

  if (viewType === "timeGridWeek" || viewType === "listWeek") {
    const inclusiveEnd = new Date(arg.end.getTime() - oneDayMs);
    const formatter = new Intl.DateTimeFormat(intlLocale, {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
    return typeof formatter.formatRange === "function"
      ? formatter.formatRange(arg.start, inclusiveEnd)
      : `${formatter.format(arg.start)} - ${formatter.format(inclusiveEnd)}`;
  }

  return new Intl.DateTimeFormat(intlLocale, {
    day: "numeric",
    month: "long",
    weekday: "short",
    year: "numeric"
  }).format(arg.start);
}

function isTodayInRange(start: Date, end: Date) {
  const todayStart = startOfLocalDay(new Date());
  const todayEnd = addLocalDays(todayStart, 1);
  return todayStart < end && todayEnd > start;
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function calendarWorkdayScrollTop() {
  const now = new Date();
  const slotMinHour = 8;
  const slotMaxHour = 23;
  const slotHeight = 32;
  const visibleLeadSlots = 3;
  const minutesFromStart = Math.max(
    0,
    Math.min((slotMaxHour - slotMinHour) * 60, (now.getHours() - slotMinHour) * 60 + now.getMinutes())
  );

  return Math.max(0, Math.round((minutesFromStart / 30) * slotHeight - visibleLeadSlots * slotHeight));
}
