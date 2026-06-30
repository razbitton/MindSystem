import { describe, expect, it } from "vitest";
import {
  decideAiOperation,
  getDefaultAiOperationPolicy,
  sourceReliabilityDefaults,
  type AiOperationSignal
} from "./ai-operation-policy.js";

const baseOperation: AiOperationSignal = {
  operationType: "create_memory",
  confidence: 0.9,
  sourceReliability: sourceReliabilityDefaults.manual_note,
  hasSourceQuote: true,
  userExplicitlyRequested: false,
  destructive: false,
  reversible: true,
  bulkCount: 1,
  conflicts: [],
  ambiguousTargets: [],
  sensitiveFlags: [],
  projectResolved: true
};

describe("decideAiOperation", () => {
  it("auto-applies high-confidence memory with source evidence in balanced mode", () => {
    expect(decideAiOperation(getDefaultAiOperationPolicy("balanced"), baseOperation)).toBe("auto_apply_with_audit");
  });

  it("ignores low-confidence junk instead of sending it to review", () => {
    expect(
      decideAiOperation(getDefaultAiOperationPolicy("balanced"), {
        ...baseOperation,
        confidence: 0.3,
        hasSourceQuote: false,
        sourceReliability: sourceReliabilityDefaults.unclear_imported_text
      })
    ).toBe("reject_or_ignore");
  });

  it("creates an exception for conflicts", () => {
    expect(
      decideAiOperation(getDefaultAiOperationPolicy("balanced"), {
        ...baseOperation,
        conflicts: [{ kind: "decision_conflict" }]
      })
    ).toBe("needs_review");
  });

  it("auto-applies explicit single-task updates", () => {
    expect(
      decideAiOperation(getDefaultAiOperationPolicy("balanced"), {
        ...baseOperation,
        operationType: "update_task",
        confidence: 0.7,
        hasSourceQuote: false,
        userExplicitlyRequested: true,
        sourceReliability: sourceReliabilityDefaults.direct_user_command
      })
    ).toBe("auto_apply_with_audit");
  });

  it("routes ambiguous task updates to exceptions", () => {
    expect(
      decideAiOperation(getDefaultAiOperationPolicy("balanced"), {
        ...baseOperation,
        operationType: "update_task",
        userExplicitlyRequested: true,
        ambiguousTargets: ["launch checklist", "beta checklist"]
      })
    ).toBe("needs_review");
  });

  it("requires review for destructive actions", () => {
    expect(
      decideAiOperation(getDefaultAiOperationPolicy("autopilot"), {
        ...baseOperation,
        operationType: "delete_entity",
        destructive: true
      })
    ).toBe("needs_review");
  });

  it("is stricter in conservative mode than autopilot for medium-confidence reversible changes", () => {
    const operation = {
      ...baseOperation,
      confidence: 0.78,
      sourceReliability: sourceReliabilityDefaults.backfilled_raw_capture
    };

    expect(decideAiOperation(getDefaultAiOperationPolicy("conservative"), operation)).toBe("needs_review");
    expect(decideAiOperation(getDefaultAiOperationPolicy("autopilot"), operation)).toBe("auto_apply_with_audit");
  });
});
