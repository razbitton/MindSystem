import type { AppEnv } from "@personal-context-os/config";
import { googleCalendarConnections } from "@personal-context-os/db";
import {
  googleCalendarCreateEventSchema,
  googleCalendarEventsQuerySchema,
  googleCalendarPatchEventSchema,
  googleCalendarPreferencesSchema,
  googleCalendarSendUpdatesSchema,
  type GoogleCalendarCreateEventInput,
  type GoogleCalendarPatchEventInput
} from "@personal-context-os/shared";
import { and, eq } from "drizzle-orm";
import { calendar_v3, google } from "googleapis";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { z } from "zod";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

export const googleCalendarScopes = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly"
] as const;

const oauthStateMaxAgeMs = 10 * 60 * 1000;
const writableCalendarRoles = new Set(["owner", "writer"]);
type GoogleConnection = typeof googleCalendarConnections.$inferSelect;
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
type GoogleCalendarListEntry = ReturnType<typeof mapGoogleCalendarListEntry>;

export const googleCalendarDeleteEventQuerySchema = z.object({
  calendarId: z.string().min(1),
  sendUpdates: googleCalendarSendUpdatesSchema.default("all")
});

export interface GoogleCalendarStatePayload {
  workspaceId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
}

export async function getGoogleCalendarStatus(context: AppContext) {
  const connection = await getConnection(context);
  return {
    configured: hasGoogleCalendarConfig(context.env),
    connected: Boolean(connection),
    googleAccountEmail: connection?.googleAccountEmail ?? null,
    selectedCalendarIds: connection?.selectedCalendarIds ?? [],
    scopes: connection?.scope ?? []
  };
}

export async function createGoogleCalendarAuthorizationUrl(context: AppContext) {
  assertUserContext(context);
  const { clientId, clientSecret } = requireGoogleCalendarConfig(context.env);
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, googleCalendarRedirectUri(context.env));
  const state = signGoogleCalendarOAuthState(context.env.JWT_SECRET, {
    workspaceId: context.workspaceId,
    userId: context.userId!,
    nonce: randomBytes(16).toString("base64url"),
    issuedAt: Date.now()
  });

  return {
    authorizationUrl: oauth2Client.generateAuthUrl({
      access_type: "offline",
      include_granted_scopes: true,
      prompt: "consent",
      scope: [...googleCalendarScopes],
      state
    })
  };
}

export async function completeGoogleCalendarOAuth(
  context: AppContext,
  query: unknown,
  actor: Actor
) {
  assertUserContext(context);
  const parsed = z.object({
    code: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    error: z.string().optional()
  }).parse(query ?? {});

  if (parsed.error) throw new Error(`Google Calendar authorization failed: ${parsed.error}`);
  if (!parsed.code || !parsed.state) throw new Error("Missing Google Calendar authorization response.");

  const state = verifyGoogleCalendarOAuthState(context.env.JWT_SECRET, parsed.state);
  if (!state || state.workspaceId !== context.workspaceId || state.userId !== context.userId) {
    throw new Error("Invalid Google Calendar authorization state.");
  }

  const { clientId, clientSecret, encryptionKey } = requireGoogleCalendarConfig(context.env);
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, googleCalendarRedirectUri(context.env));
  const { tokens } = await oauth2Client.getToken(parsed.code);
  const existing = await getConnection(context);
  const refreshToken = tokens.refresh_token ?? (existing ? decryptToken(existing.refreshTokenCiphertext, encryptionKey) : null);
  if (!refreshToken) {
    throw new Error("Google did not return a refresh token. Disconnect the app in Google Account permissions and connect again.");
  }

  oauth2Client.setCredentials({
    ...tokens,
    refresh_token: refreshToken
  });

  const calendars = await listCalendarsFromGoogle(oauth2Client);
  const primaryCalendar = calendars.find((calendar) => calendar.primary) ?? calendars[0] ?? null;
  const selectedCalendarIds = existing?.selectedCalendarIds?.length
    ? existing.selectedCalendarIds
    : primaryCalendar?.id
      ? [primaryCalendar.id]
      : [];
  const googleAccountEmail = primaryCalendar?.id && primaryCalendar.id.includes("@") ? primaryCalendar.id : existing?.googleAccountEmail ?? null;

  const values = {
    workspaceId: context.workspaceId,
    userId: context.userId!,
    googleAccountEmail,
    accessTokenCiphertext: tokens.access_token ? encryptToken(tokens.access_token, encryptionKey) : existing?.accessTokenCiphertext ?? null,
    refreshTokenCiphertext: encryptToken(refreshToken, encryptionKey),
    tokenType: tokens.token_type ?? existing?.tokenType ?? null,
    scope: scopeArray(tokens.scope) || existing?.scope || [...googleCalendarScopes],
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : existing?.expiryDate ?? null,
    selectedCalendarIds,
    updatedAt: new Date()
  };

  await context.db
    .insert(googleCalendarConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [googleCalendarConnections.workspaceId, googleCalendarConnections.userId],
      set: values
    });

  await writeAuditEvent(context, {
    ...actor,
    action: "google calendar connected",
    metadata: {
      googleAccountEmail,
      selectedCalendarIds
    }
  });

  return { ok: true, googleAccountEmail, selectedCalendarIds };
}

export async function disconnectGoogleCalendar(context: AppContext, actor: Actor) {
  assertUserContext(context);
  const connection = await getConnection(context);
  if (!connection) return { ok: true };

  const config = requireGoogleCalendarConfig(context.env);
  const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret, googleCalendarRedirectUri(context.env));
  const tokenToRevoke = connection.refreshTokenCiphertext
    ? decryptToken(connection.refreshTokenCiphertext, config.encryptionKey)
    : connection.accessTokenCiphertext
      ? decryptToken(connection.accessTokenCiphertext, config.encryptionKey)
      : null;

  if (tokenToRevoke) {
    await oauth2Client.revokeToken(tokenToRevoke).catch(() => undefined);
  }

  await context.db
    .delete(googleCalendarConnections)
    .where(
      and(
        eq(googleCalendarConnections.workspaceId, context.workspaceId),
        eq(googleCalendarConnections.userId, context.userId!)
      )
    );

  await writeAuditEvent(context, {
    ...actor,
    action: "google calendar disconnected",
    metadata: { googleAccountEmail: connection.googleAccountEmail }
  });

  return { ok: true };
}

export async function listGoogleCalendars(context: AppContext) {
  const { connection, oauth2Client } = await authorizedGoogleCalendarClient(context);
  const calendars = await listCalendarsFromGoogle(oauth2Client);
  const selected = new Set(connection.selectedCalendarIds ?? []);
  return {
    calendars: calendars.map((calendar) => ({
      ...calendar,
      selected: selected.has(calendar.id)
    })),
    selectedCalendarIds: connection.selectedCalendarIds ?? []
  };
}

export async function updateGoogleCalendarPreferences(context: AppContext, input: unknown, actor: Actor) {
  assertUserContext(context);
  const parsed = googleCalendarPreferencesSchema.parse(input ?? {});
  const connection = await requireConnection(context);
  await context.db
    .update(googleCalendarConnections)
    .set({
      selectedCalendarIds: parsed.selectedCalendarIds,
      updatedAt: new Date()
    })
    .where(eq(googleCalendarConnections.id, connection.id));

  await writeAuditEvent(context, {
    ...actor,
    action: "google calendar preferences updated",
    metadata: { selectedCalendarIds: parsed.selectedCalendarIds }
  });

  return { ok: true, selectedCalendarIds: parsed.selectedCalendarIds };
}

export async function listGoogleCalendarEvents(context: AppContext, query: unknown) {
  const parsed = googleCalendarEventsQuerySchema.parse(query ?? {});
  const { connection, oauth2Client } = await authorizedGoogleCalendarClient(context);
  const requestedCalendarIds = normalizeCalendarIds(parsed.calendarIds);
  const selectedCalendarIds: string[] = requestedCalendarIds.length ? requestedCalendarIds : connection.selectedCalendarIds ?? [];
  if (!selectedCalendarIds.length) return { events: [] };

  const calendarEntries = await listCalendarsFromGoogle(oauth2Client);
  const calendarById = new Map(calendarEntries.map((calendar) => [calendar.id, calendar]));
  const calendars = await Promise.all(
    selectedCalendarIds.map((calendarId) => listEventsForCalendar(oauth2Client, calendarId, parsed, calendarById.get(calendarId)))
  );

  return {
    events: calendars.flatMap((calendar) => calendar.events)
  };
}

export async function createGoogleCalendarEvent(context: AppContext, input: unknown, actor: Actor) {
  const parsed = googleCalendarCreateEventSchema.parse(input);
  const { oauth2Client } = await authorizedGoogleCalendarClient(context);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const requestBody = buildGoogleEventResource(parsed);
  const response = await calendar.events.insert({
    calendarId: parsed.calendarId,
    requestBody,
    sendUpdates: parsed.sendUpdates
  });

  await writeAuditEvent(context, {
    ...actor,
    action: "google calendar event created",
    metadata: { calendarId: parsed.calendarId, eventId: response.data.id, summary: parsed.summary }
  });

  return { event: mapGoogleCalendarEvent(parsed.calendarId, null, response.data, "writer") };
}

export async function patchGoogleCalendarEvent(
  context: AppContext,
  eventId: string,
  input: unknown,
  actor: Actor
) {
  const parsed = googleCalendarPatchEventSchema.parse(input);
  const { oauth2Client } = await authorizedGoogleCalendarClient(context);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const requestBody = await buildGoogleEventPatch(calendar, eventId, parsed);
  const response = await calendar.events.patch({
    calendarId: parsed.calendarId,
    eventId,
    requestBody,
    sendUpdates: parsed.sendUpdates ?? "all"
  });

  await writeAuditEvent(context, {
    ...actor,
    action: "google calendar event updated",
    metadata: { calendarId: parsed.calendarId, eventId, summary: parsed.summary }
  });

  return { event: mapGoogleCalendarEvent(parsed.calendarId, null, response.data, "writer") };
}

export async function deleteGoogleCalendarEvent(
  context: AppContext,
  eventId: string,
  query: unknown,
  actor: Actor
) {
  const parsed = googleCalendarDeleteEventQuerySchema.parse(query ?? {});
  const { oauth2Client } = await authorizedGoogleCalendarClient(context);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const params: calendar_v3.Params$Resource$Events$Delete = {
    calendarId: parsed.calendarId,
    eventId,
    sendUpdates: parsed.sendUpdates
  };
  await calendar.events.delete(params);

  await writeAuditEvent(context, {
    ...actor,
    action: "google calendar event deleted",
    metadata: { calendarId: parsed.calendarId, eventId }
  });

  return { ok: true };
}

export function signGoogleCalendarOAuthState(secret: string, payload: GoogleCalendarStatePayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyGoogleCalendarOAuthState(secret: string, state: string, now = Date.now()): GoogleCalendarStatePayload | null {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) return null;
  const expected = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  const signatureBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<GoogleCalendarStatePayload>;
    if (!payload.workspaceId || !payload.userId || !payload.nonce || typeof payload.issuedAt !== "number") return null;
    if (payload.issuedAt > now || now - payload.issuedAt > oauthStateMaxAgeMs) return null;
    return payload as GoogleCalendarStatePayload;
  } catch {
    return null;
  }
}

export function encryptToken(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptToken(value: string, key: Buffer) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted token.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function buildGoogleEventResource(input: GoogleCalendarCreateEventInput | GoogleCalendarPatchEventInput): calendar_v3.Schema$Event {
  const event: calendar_v3.Schema$Event = {};
  if (input.summary !== undefined) event.summary = input.summary;
  if (input.description !== undefined) event.description = input.description || null;
  if (input.location !== undefined) event.location = input.location || null;
  if (input.start && input.end) {
    if (input.allDay) {
      event.start = { date: input.start };
      event.end = { date: input.end };
    } else {
      event.start = { dateTime: input.start };
      event.end = { dateTime: input.end };
      if (input.timeZone) {
        event.start.timeZone = input.timeZone;
        event.end.timeZone = input.timeZone;
      }
    }
  }
  if (input.attendees !== undefined) {
    event.attendees = input.attendees.map((attendee) => ({ email: attendee.email }));
  }
  return event;
}

export function mergeGoogleCalendarAttendees(
  existingAttendees: calendar_v3.Schema$EventAttendee[] | undefined,
  nextAttendees: { email: string }[]
) {
  const existingByEmail = new Map(
    (existingAttendees ?? [])
      .filter((attendee) => attendee.email)
      .map((attendee) => [attendee.email!.toLowerCase(), attendee])
  );

  return nextAttendees.map((attendee) => {
    const existing = existingByEmail.get(attendee.email.toLowerCase());
    return existing ? { ...existing, email: attendee.email } : { email: attendee.email };
  });
}

export function mapGoogleCalendarEvent(
  calendarId: string,
  calendarSummary: string | null,
  event: calendar_v3.Schema$Event,
  accessRole: string | null | undefined,
  colors: { backgroundColor?: string; foregroundColor?: string } = {}
) {
  const allDay = Boolean(event.start?.date);
  const writable = writableCalendarRoles.has(String(accessRole ?? "writer"));
  const mapped = {
    id: `${calendarId}:${event.id ?? ""}`,
    eventId: event.id ?? "",
    calendarId,
    calendarSummary,
    title: event.summary || "(No title)",
    start: event.start?.dateTime ?? event.start?.date ?? null,
    end: event.end?.dateTime ?? event.end?.date ?? null,
    allDay,
    editable: writable && event.status !== "cancelled",
    canEdit: writable && event.status !== "cancelled",
    extendedProps: {
      eventId: event.id ?? "",
      calendarId,
      calendarSummary,
      description: event.description ?? "",
      location: event.location ?? "",
      attendees: (event.attendees ?? []).map((attendee) => ({
        email: attendee.email ?? "",
        displayName: attendee.displayName ?? "",
        responseStatus: attendee.responseStatus ?? "",
        optional: Boolean(attendee.optional),
        self: Boolean(attendee.self),
        organizer: Boolean(attendee.organizer)
      })),
      htmlLink: event.htmlLink ?? "",
      status: event.status ?? "",
      eventType: event.eventType ?? "",
      recurringEventId: event.recurringEventId ?? "",
      originalStartTime: event.originalStartTime ?? null,
      creator: event.creator ?? null,
      organizer: event.organizer ?? null,
      canEdit: writable && event.status !== "cancelled"
    }
  };

  if (colors.backgroundColor) {
    return {
      ...mapped,
      backgroundColor: colors.backgroundColor,
      borderColor: colors.backgroundColor,
      ...(colors.foregroundColor ? { textColor: colors.foregroundColor } : {})
    };
  }

  return colors.foregroundColor ? { ...mapped, textColor: colors.foregroundColor } : mapped;
}

function hasGoogleCalendarConfig(env: AppEnv) {
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY);
}

function requireGoogleCalendarConfig(env: AppEnv) {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY) {
    throw new Error("Google Calendar is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY.");
  }

  const encryptionKey = Buffer.from(env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY, "base64");
  if (encryptionKey.length !== 32) {
    throw new Error("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }

  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    encryptionKey
  };
}

function googleCalendarRedirectUri(env: AppEnv) {
  return new URL("/api/google-calendar/oauth/callback", env.APP_BASE_URL).toString();
}

function assertUserContext(context: AppContext): asserts context is AppContext & { userId: string } {
  if (!context.userId) throw new Error("Google Calendar requires a signed-in user session.");
}

async function getConnection(context: AppContext) {
  if (!context.userId) return null;
  const [connection] = await context.db
    .select()
    .from(googleCalendarConnections)
    .where(
      and(
        eq(googleCalendarConnections.workspaceId, context.workspaceId),
        eq(googleCalendarConnections.userId, context.userId)
      )
    )
    .limit(1);
  return connection ?? null;
}

async function requireConnection(context: AppContext) {
  const connection = await getConnection(context);
  if (!connection) throw new Error("Google Calendar is not connected.");
  return connection;
}

async function authorizedGoogleCalendarClient(context: AppContext) {
  assertUserContext(context);
  const connection = await requireConnection(context);
  const config = requireGoogleCalendarConfig(context.env);
  const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret, googleCalendarRedirectUri(context.env));
  const credentials: Parameters<typeof oauth2Client.setCredentials>[0] = {
    refresh_token: decryptToken(connection.refreshTokenCiphertext, config.encryptionKey),
  };
  if (connection.accessTokenCiphertext) credentials.access_token = decryptToken(connection.accessTokenCiphertext, config.encryptionKey);
  if (connection.expiryDate) credentials.expiry_date = connection.expiryDate.getTime();
  if (connection.tokenType) credentials.token_type = connection.tokenType;
  const scope = connection.scope?.join(" ");
  if (scope) credentials.scope = scope;
  oauth2Client.setCredentials(credentials);
  oauth2Client.on("tokens", (tokens) => {
    void storeRefreshedTokens(context, connection, tokens, config.encryptionKey);
  });
  return { connection, oauth2Client };
}

async function storeRefreshedTokens(
  context: AppContext,
  connection: GoogleConnection,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
    token_type?: string | null;
    scope?: string | null;
  },
  encryptionKey: Buffer
) {
  const updates: Partial<typeof googleCalendarConnections.$inferInsert> = { updatedAt: new Date() };
  if (tokens.access_token) updates.accessTokenCiphertext = encryptToken(tokens.access_token, encryptionKey);
  if (tokens.refresh_token) updates.refreshTokenCiphertext = encryptToken(tokens.refresh_token, encryptionKey);
  if (tokens.expiry_date) updates.expiryDate = new Date(tokens.expiry_date);
  if (tokens.token_type) updates.tokenType = tokens.token_type;
  const scopes = scopeArray(tokens.scope);
  if (scopes) updates.scope = scopes;

  await context.db
    .update(googleCalendarConnections)
    .set(updates)
    .where(eq(googleCalendarConnections.id, connection.id));
}

async function listCalendarsFromGoogle(oauth2Client: OAuth2Client) {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const calendars: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;

  do {
    const params: calendar_v3.Params$Resource$Calendarlist$List = {
      maxResults: 250,
      showHidden: false
    };
    if (pageToken) params.pageToken = pageToken;
    const response = await calendar.calendarList.list(params);
    calendars.push(...(response.data.items ?? []).map(mapGoogleCalendarListEntry).filter((item) => Boolean(item.id)));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return calendars;
}

function mapGoogleCalendarListEntry(calendar: calendar_v3.Schema$CalendarListEntry) {
  const accessRole = calendar.accessRole ?? "reader";
  return {
    id: calendar.id ?? "",
    summary: calendar.summary ?? calendar.id ?? "",
    description: calendar.description ?? "",
    primary: Boolean(calendar.primary),
    accessRole,
    writable: writableCalendarRoles.has(accessRole),
    backgroundColor: calendar.backgroundColor ?? "",
    foregroundColor: calendar.foregroundColor ?? "",
    timeZone: calendar.timeZone ?? ""
  };
}

async function listEventsForCalendar(
  oauth2Client: OAuth2Client,
  calendarId: string,
  query: z.infer<typeof googleCalendarEventsQuerySchema>,
  calendarEntry?: GoogleCalendarListEntry
) {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const events: ReturnType<typeof mapGoogleCalendarEvent>[] = [];
  let pageToken: string | undefined;
  let accessRole: string | null | undefined = calendarEntry?.accessRole;
  let calendarSummary: string | null = calendarEntry?.summary ?? null;

  do {
    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId,
      maxResults: 2500,
      orderBy: "startTime",
      showDeleted: false,
      singleEvents: true,
      timeMax: query.timeMax,
      timeMin: query.timeMin
    };
    if (pageToken) params.pageToken = pageToken;
    if (query.timeZone) params.timeZone = query.timeZone;
    const response = await calendar.events.list(params);
    accessRole = response.data.accessRole;
    calendarSummary = response.data.summary ?? calendarSummary;
    events.push(
      ...(response.data.items ?? [])
        .filter((event) => event.status !== "cancelled")
        .map((event) => mapGoogleCalendarEvent(calendarId, calendarSummary, event, accessRole, calendarEntry))
    );
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return { calendarId, events };
}

async function buildGoogleEventPatch(
  calendar: calendar_v3.Calendar,
  eventId: string,
  input: GoogleCalendarPatchEventInput
) {
  const requestBody = buildGoogleEventResource(input);
  if (input.attendees !== undefined) {
    const existing = await calendar.events.get({
      calendarId: input.calendarId,
      eventId
    });
    requestBody.attendees = mergeGoogleCalendarAttendees(existing.data.attendees, input.attendees);
  }
  return requestBody;
}

function normalizeCalendarIds(value: string | string[] | undefined) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : value.split(",");
  return values.map((item) => item.trim()).filter(Boolean);
}

function scopeArray(value: string | null | undefined) {
  const scopes = value?.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
  return scopes?.length ? scopes : null;
}
