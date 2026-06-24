import { describe, expect, it } from "vitest";
import { buildDailyAgenda, resolveDashboardWindow } from "./dashboard.js";

const window = {
  date: "2026-06-24",
  start: new Date("2026-06-24T00:00:00.000Z"),
  end: new Date("2026-06-24T23:59:59.999Z"),
  now: new Date("2026-06-24T12:00:00.000Z")
};

describe("daily dashboard agenda", () => {
  it("classifies and ranks immediate task objectives", () => {
    const agenda = buildDailyAgenda([
      task("scheduled", { scheduled_for: "2026-06-24T15:00:00.000Z" }),
      task("overdue", { due_at: "2026-06-23T15:00:00.000Z" }),
      task("urgent", { priority: "urgent" }),
      task("in progress", { status: "in_progress" }),
      task("future", { due_at: "2026-06-30T15:00:00.000Z", objective_state: "pinned" })
    ], [], window);

    expect(agenda.dailyObjectives.map((item) => item.id)).toEqual([
      "future",
      "overdue",
      "in progress",
      "scheduled",
      "urgent"
    ]);
    expect(agenda.dailyObjectiveSections.scheduled.map((item) => item.id)).toEqual(["scheduled"]);
    expect(agenda.dailyObjectiveSections.deadlines.map((item) => item.id)).toEqual(["overdue"]);
  });

  it("keeps waiting tasks out of focus unless they are manually pinned", () => {
    const agenda = buildDailyAgenda([
      task("waiting due", { status: "waiting", due_at: "2026-06-24T10:00:00.000Z" }),
      task("waiting pinned", { status: "waiting", objective_state: "pinned" })
    ], [], window);

    expect(agenda.dailyObjectives.map((item) => item.id)).toEqual(["waiting pinned"]);
    expect(agenda.dailyObjectiveSections.waiting.map((item) => item.id)).toContain("waiting due");
  });

  it("hides dismissed and closed tasks", () => {
    const agenda = buildDailyAgenda([
      task("dismissed", { objective_state: "dismissed", priority: "urgent" }),
      task("done", { status: "done", priority: "urgent" }),
      task("cancelled", { status: "cancelled", priority: "urgent" }),
      task("visible", { priority: "urgent" })
    ], [], window);

    expect(agenda.dailyObjectives.map((item) => item.id)).toEqual(["visible"]);
  });

  it("includes reminders due by the end of the day as agenda signals", () => {
    const agenda = buildDailyAgenda([], [
      { id: "reminder", title: "Call Sam", remind_at: "2026-06-24T09:00:00.000Z" }
    ], window);

    expect(agenda.dailyReminders).toHaveLength(1);
    expect(agenda.dailyObjectiveSections.reminders[0]?.objectiveReasons).toEqual(["reminder"]);
  });

  it("resolves explicit local dashboard windows", () => {
    const resolved = resolveDashboardWindow({
      date: "2026-06-24",
      start: "2026-06-23T21:00:00.000Z",
      end: "2026-06-24T20:59:59.999Z"
    }, window.now);

    expect(resolved.date).toBe("2026-06-24");
    expect(resolved.start.toISOString()).toBe("2026-06-23T21:00:00.000Z");
  });
});

function task(id: string, fields: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    status: "todo",
    priority: "medium",
    updated_at: "2026-06-24T11:00:00.000Z",
    ...fields
  };
}
