import { describe, expect, it } from "vitest";
import { createTaskSchema } from "@personal-context-os/shared";
import { parseTaskFilters } from "./tasks.js";

describe("task service validation", () => {
  it("defaults new tasks to todo and medium priority", () => {
    const parsed = createTaskSchema.parse({ title: "Draft review notes" });

    expect(parsed.status).toBe("todo");
    expect(parsed.priority).toBe("medium");
  });

  it("parses task filters", () => {
    const filters = parseTaskFilters({ status: "in_progress", priority: "urgent" });

    expect(filters.status).toBe("in_progress");
    expect(filters.priority).toBe("urgent");
  });
});
