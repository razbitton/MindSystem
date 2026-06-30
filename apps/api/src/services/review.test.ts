import { describe, expect, it } from "vitest";
import {
  buildPinnedPreferenceCustomFields,
  buildReviewMergeCustomFields,
  mergeReviewConfidence
} from "./review.js";

describe("review memory lifecycle helpers", () => {
  it("preserves target metadata while merging candidate fields", () => {
    const fields = buildReviewMergeCustomFields(
      { pinned: true, locale: "he", mergedReviewItemIds: ["old-review"] },
      { locale: "en", confidenceReason: "Repeated by user" },
      ["old-review", "new-review"],
      "duplicate memory"
    );

    expect(fields).toEqual({
      pinned: true,
      locale: "en",
      confidenceReason: "Repeated by user",
      mergedReviewItemIds: ["old-review", "new-review"],
      lastMergeReason: "duplicate memory"
    });
  });

  it("preserves higher existing confidence during merge", () => {
    expect(mergeReviewConfidence("0.93", 0.81)).toBe(0.93);
    expect(mergeReviewConfidence("0.5", 0.77)).toBe(0.8);
  });

  it("preserves existing preference metadata when pinning", () => {
    expect(buildPinnedPreferenceCustomFields({ locale: "en", confidenceReason: "Explicit user preference" }, "review-id")).toEqual({
      locale: "en",
      confidenceReason: "Explicit user preference",
      pinned: true,
      pinnedFromReviewItemId: "review-id"
    });
  });
});
