import { describe, expect, it } from "vitest";
import {
  getRelevantContextSchema,
  recallMemorySchema,
  storeMemorySchema
} from "./schemas.js";

describe("memory schemas", () => {
  it("accepts structured memory candidates without free text", () => {
    const parsed = storeMemorySchema.parse({
      candidates: [
        {
          kind: "decision",
          title: "Keep beta small",
          body: "The beta should stay small until supplier pricing is confirmed."
        }
      ]
    });

    expect(parsed.sourceType).toBe("codex");
    expect(parsed.candidates[0]?.confidence).toBe(0.8);
  });

  it("requires recall queries but applies retrieval defaults", () => {
    const parsed = recallMemorySchema.parse({ query: "supplier pricing" });

    expect(parsed.limit).toBe(10);
    expect(parsed.includeSuperseded).toBe(false);
    expect(parsed.kinds).toEqual([]);
  });

  it("applies context defaults for agent turn assembly", () => {
    const parsed = getRelevantContextSchema.parse({ message: "What did we decide?" });

    expect(parsed.maxTokens).toBe(2500);
    expect(parsed.activeEntityIds).toEqual([]);
  });
});
