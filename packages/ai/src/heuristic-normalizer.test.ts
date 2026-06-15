import { describe, expect, it } from "vitest";
import { normalizerOutputSchema } from "@personal-context-os/shared";
import { HeuristicNormalizer } from "./heuristic-normalizer.js";

describe("HeuristicNormalizer", () => {
  it("produces schema-valid project, task, note, and reminder entities", async () => {
    const normalizer = new HeuristicNormalizer();
    const output = await normalizer.normalize({
      text: `Project: Launch Plan
Task: write launch checklist tomorrow
Note: Stakeholders want a smaller beta.
Remind me to send status update tomorrow`,
      now: new Date("2026-06-15T08:00:00.000Z")
    });

    expect(() => normalizerOutputSchema.parse(output)).not.toThrow();
    expect(output.projects[0]?.title).toBe("Launch Plan");
    expect(output.tasks[0]?.title).toBe("write launch checklist");
    expect(output.notes[0]?.title).toContain("Stakeholders");
    expect(output.reminders[0]?.title).toBe("send status update");
  });

  it("marks ambiguous short inputs as low confidence", async () => {
    const normalizer = new HeuristicNormalizer();
    const output = await normalizer.normalize({ text: "hmm" });

    expect(output.confidence).toBeLessThan(0.75);
    expect(output.uncertainties.length).toBeGreaterThan(0);
  });
});
