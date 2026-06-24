import { describe, expect, it } from "vitest";
import { createTaskSchema, setDailyObjectiveSchema } from "@personal-context-os/shared";
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
    expect(setDailyObjectiveSchema.parse({ date: "2026-06-24", action: "dismiss" }).action).toBe("dismiss");
    expect(
      setDailyObjectiveSchema.parse({
        date: "2026-06-24",
        action: "snooze",
        targetDate: "2026-06-25"
      }).targetDate
    ).toBe("2026-06-25");
    expect(setDailyObjectiveSchema.parse({ date: "2026-06-24", action: "clear" }).action).toBe("clear");
  });

  it("rejects invalid daily objective dates and snoozes without a target date", () => {
    expect(() => setDailyObjectiveSchema.parse({ date: "2026-6-24", action: "pin" })).toThrow("Expected YYYY-MM-DD");
    expect(() => setDailyObjectiveSchema.parse({ date: "2026-06-24", action: "snooze" })).toThrow(
      "targetDate is required"
    );
  });
});
