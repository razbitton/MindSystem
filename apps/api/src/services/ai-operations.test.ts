import { getDefaultAiOperationPolicy, type AiOperationPolicy } from "@personal-context-os/shared";
import { describe, expect, it } from "vitest";
import { mergeAiOperationPolicyPatch } from "./ai-operations.js";

const existingPolicy: AiOperationPolicy = {
  mode: "balanced",
  autoApplyMinConfidence: 0.88,
  reviewBelowConfidence: 0.58,
  requireReviewForDestructive: true,
  requireReviewForSensitive: false,
  requireReviewForConflicts: true,
  requireReviewForBulkChanges: false,
  maxAutoApplyBatchSize: 7
};

describe("AI operation policy patches", () => {
  it("preserves existing values omitted from a partial patch", () => {
    const next = mergeAiOperationPolicyPatch(existingPolicy, { reviewBelowConfidence: 0.5 });

    expect(next).toEqual({
      ...existingPolicy,
      reviewBelowConfidence: 0.5
    });
  });

  it("resets to mode defaults when only mode changes", () => {
    const next = mergeAiOperationPolicyPatch(existingPolicy, { mode: "conservative" });

    expect(next).toEqual(getDefaultAiOperationPolicy("conservative"));
  });

  it("preserves omitted existing values when mode changes with explicit tuning", () => {
    const next = mergeAiOperationPolicyPatch(existingPolicy, {
      mode: "autopilot",
      autoApplyMinConfidence: 0.76
    });

    expect(next).toEqual({
      ...existingPolicy,
      mode: "autopilot",
      autoApplyMinConfidence: 0.76
    });
  });

  it("rejects empty patches", () => {
    expect(() => mergeAiOperationPolicyPatch(existingPolicy, {})).toThrow("At least one policy setting is required.");
  });
});
