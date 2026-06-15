import { describe, expect, it } from "vitest";
import { normalizerOutputSchema } from "@personal-context-os/shared";
import { buildIngestPlan } from "./ingest-plan.js";

describe("buildIngestPlan", () => {
  it("routes low-confidence normalized items to review", () => {
    const output = normalizerOutputSchema.parse({
      intent: "create_reminder",
      confidence: 0.68,
      projects: [],
      tasks: [],
      notes: [],
      reminders: [{ title: "call Sam", confidence: 0.65, customFields: {} }],
      people: [],
      decisions: [],
      goals: [],
      relationships: [],
      uncertainties: ["No reminder time found."]
    });

    const plan = buildIngestPlan(output);

    expect(plan.shouldAutoApply).toBe(false);
    expect(plan.lowConfidenceCounts.reminders).toBe(1);
    expect(plan.reviewReasons).toContain("No reminder time found.");
  });
});
