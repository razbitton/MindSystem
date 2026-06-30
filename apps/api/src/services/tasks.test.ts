import { describe, expect, it } from "vitest";
import { createTaskSchema, manageTaskSchema, setDailyObjectiveSchema } from "@personal-context-os/shared";
import { parseTaskFilters } from "./tasks.js";

describe("task service validation", () => {
  it("defaults new tasks to todo and medium priority", () => {
    const parsed = createTaskSchema.parse({ title: "Draft review notes" });

    expect(parsed.status).toBe("todo");
    expect(parsed.priority).toBe("medium");
  });

  it("rejects bracketed metadata in task titles", () => {
    expect(() => createTaskSchema.parse({ title: "[Raz] Draft review notes" })).toThrow(
      "Task title must not start with bracketed metadata"
    );
  });

  it("parses task filters", () => {
    const filters = parseTaskFilters({ status: "in_progress", priority: "urgent" });

    expect(filters.status).toBe("in_progress");
    expect(filters.priority).toBe("urgent");
  });

  it("validates daily objective actions", () => {
    expect(setDailyObjectiveSchema.parse({ date: "2026-06-24", action: "pin" }).action).toBe("pin");
    expect(
      setDailyObjectiveSchema.parse({
        date: "2026-06-24",
        action: "snooze",
        targetDate: "2026-06-25"
      }).targetDate
    ).toBe("2026-06-25");
    expect(setDailyObjectiveSchema.parse({ date: "2026-06-24", action: "clear" }).action).toBe("clear");
    expect(() => setDailyObjectiveSchema.parse({ date: "2026-06-24", action: "dismiss" })).toThrow();
  });

  it("rejects invalid daily objective dates and snoozes without a target date", () => {
    expect(() => setDailyObjectiveSchema.parse({ date: "2026-6-24", action: "pin" })).toThrow("Expected YYYY-MM-DD");
    expect(() => setDailyObjectiveSchema.parse({ date: "2026-06-24", action: "snooze" })).toThrow(
      "targetDate is required"
    );
  });

  it("validates high-level task manager actions", () => {
    expect(manageTaskSchema.parse({ action: "create", title: "Draft review notes" }).action).toBe("create");
    expect(manageTaskSchema.parse({ action: "update", id: "00000000-0000-0000-0000-000000000001", status: "waiting" }).status).toBe("waiting");
    expect(manageTaskSchema.parse({ action: "complete", id: "00000000-0000-0000-0000-000000000001" }).action).toBe("complete");
    expect(
      manageTaskSchema.parse({
        action: "snooze",
        id: "00000000-0000-0000-0000-000000000001",
        date: "2026-06-24",
        targetDate: "2026-06-25"
      }).targetDate
    ).toBe("2026-06-25");
    expect(
      manageTaskSchema.parse({
        action: "clear_daily_objective",
        id: "00000000-0000-0000-0000-000000000001",
        date: "2026-06-24"
      }).action
    ).toBe("clear_daily_objective");
  });

  it("rejects incomplete high-level task manager actions", () => {
    expect(() => manageTaskSchema.parse({ action: "create" })).toThrow("title is required");
    expect(() => manageTaskSchema.parse({ action: "update", status: "waiting" })).toThrow("id is required");
    expect(() => manageTaskSchema.parse({ action: "pin", id: "00000000-0000-0000-0000-000000000001" })).toThrow("date is required");
    expect(() => manageTaskSchema.parse({
      action: "snooze",
      id: "00000000-0000-0000-0000-000000000001",
      date: "2026-06-24"
    })).toThrow("targetDate is required");
  });
});
