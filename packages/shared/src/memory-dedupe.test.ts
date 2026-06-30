import { describe, expect, it } from "vitest";
import { findSimilarMemory, memorySimilarity } from "./memory-dedupe.js";

describe("memory dedupe helpers", () => {
  it("matches near-duplicate memory text even when titles differ", () => {
    const candidate = {
      title: "Keep launch invite only",
      body: "The launch should stay invite-only until onboarding is stable."
    };
    const existing = {
      title: "Launch invite-only decision",
      summary: "Launch should stay invite-only until onboarding is stable.",
      body: "The launch should stay invite-only until onboarding is stable."
    };

    expect(memorySimilarity(existing, candidate)).toBeGreaterThanOrEqual(0.72);
    expect(findSimilarMemory([existing], candidate)).toBe(existing);
  });

  it("does not match unrelated memory text", () => {
    const candidate = {
      title: "Keep launch invite only",
      body: "The launch should stay invite-only until onboarding is stable."
    };
    const existing = {
      title: "Preferred answer style",
      body: "The user prefers concise technical answers."
    };

    expect(findSimilarMemory([existing], candidate)).toBeNull();
  });
});
