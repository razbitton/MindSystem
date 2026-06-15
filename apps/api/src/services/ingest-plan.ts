import type { NormalizerOutput } from "@personal-context-os/shared";

export const AUTO_APPLY_CONFIDENCE = 0.75;

export interface IngestPlan {
  shouldAutoApply: boolean;
  reviewReasons: string[];
  lowConfidenceCounts: Record<string, number>;
}

export function buildIngestPlan(output: NormalizerOutput): IngestPlan {
  const lowConfidenceCounts: Record<string, number> = {};
  const groups = {
    projects: output.projects,
    tasks: output.tasks,
    notes: output.notes,
    reminders: output.reminders,
    people: output.people,
    decisions: output.decisions,
    goals: output.goals
  };

  for (const [key, items] of Object.entries(groups)) {
    lowConfidenceCounts[key] = items.filter((item) => item.confidence < AUTO_APPLY_CONFIDENCE).length;
  }

  const hasLowConfidence = Object.values(lowConfidenceCounts).some((count) => count > 0);
  return {
    shouldAutoApply: output.confidence >= AUTO_APPLY_CONFIDENCE,
    reviewReasons: [...output.uncertainties, ...(hasLowConfidence ? ["One or more suggested entities were below the auto-apply confidence threshold."] : [])],
    lowConfidenceCounts
  };
}
