import { describe, expect, it } from "vitest";
import {
  buildGoogleEventResource,
  decryptToken,
  encryptToken,
  mapGoogleCalendarEvent,
  mergeGoogleCalendarAttendees,
  signGoogleCalendarOAuthState,
  verifyGoogleCalendarOAuthState
} from "./google-calendar.js";

const secret = "a-long-enough-test-secret";

describe("Google Calendar OAuth state", () => {
  it("signs and validates unexpired state", () => {
    const state = signGoogleCalendarOAuthState(secret, {
      workspaceId: "workspace",
      userId: "user",
      nonce: "nonce",
      issuedAt: 1000
    });

    expect(verifyGoogleCalendarOAuthState(secret, state, 2000)).toMatchObject({
      workspaceId: "workspace",
      userId: "user",
      nonce: "nonce"
    });
  });

  it("rejects tampered and expired state", () => {
    const state = signGoogleCalendarOAuthState(secret, {
      workspaceId: "workspace",
      userId: "user",
      nonce: "nonce",
      issuedAt: 1000
    });

    expect(verifyGoogleCalendarOAuthState(secret, `${state}x`, 2000)).toBeNull();
    expect(verifyGoogleCalendarOAuthState(secret, state, 20 * 60 * 1000)).toBeNull();
  });
});

describe("Google Calendar token encryption", () => {
  it("round-trips encrypted tokens", () => {
    const key = Buffer.alloc(32, 7);
    const encrypted = encryptToken("refresh-token", key);
    expect(encrypted).not.toContain("refresh-token");
    expect(decryptToken(encrypted, key)).toBe("refresh-token");
  });
});

describe("Google Calendar event mapping", () => {
  it("builds timed and all-day Google event resources", () => {
    expect(buildGoogleEventResource({
      calendarId: "primary",
      summary: "Planning",
      start: "2026-06-24T10:00:00.000Z",
      end: "2026-06-24T11:00:00.000Z",
      allDay: false,
      timeZone: "Asia/Jerusalem",
      attendees: [{ email: "a@example.com" }],
      sendUpdates: "all"
    })).toMatchObject({
      summary: "Planning",
      start: { dateTime: "2026-06-24T10:00:00.000Z", timeZone: "Asia/Jerusalem" },
      end: { dateTime: "2026-06-24T11:00:00.000Z", timeZone: "Asia/Jerusalem" },
      attendees: [{ email: "a@example.com" }]
    });

    expect(buildGoogleEventResource({
      calendarId: "primary",
      summary: "Away",
      start: "2026-06-24",
      end: "2026-06-25",
      allDay: true,
      attendees: [],
      sendUpdates: "none"
    })).toMatchObject({
      start: { date: "2026-06-24" },
      end: { date: "2026-06-25" }
    });
  });

  it("marks read-only calendars as non-editable", () => {
    const mapped = mapGoogleCalendarEvent("cal", "Calendar", {
      id: "event",
      summary: "Read-only",
      start: { dateTime: "2026-06-24T10:00:00.000Z" },
      end: { dateTime: "2026-06-24T11:00:00.000Z" }
    }, "reader");

    expect(mapped.editable).toBe(false);
    expect(mapped.extendedProps.canEdit).toBe(false);
  });

  it("preserves existing attendee metadata when replacing attendee arrays", () => {
    expect(mergeGoogleCalendarAttendees([
      {
        email: "a@example.com",
        displayName: "A",
        responseStatus: "accepted",
        optional: true
      },
      {
        email: "removed@example.com",
        responseStatus: "declined"
      }
    ], [
      { email: "a@example.com" },
      { email: "new@example.com" }
    ])).toEqual([
      {
        email: "a@example.com",
        displayName: "A",
        responseStatus: "accepted",
        optional: true
      },
      { email: "new@example.com" }
    ]);
  });
});
