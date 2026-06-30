export type AiAutonomyMode = "conservative" | "balanced" | "autopilot";

export type AiOperationDecision =
  | "auto_apply"
  | "auto_apply_with_audit"
  | "needs_review"
  | "reject_or_ignore";

export type AiOperationType =
  | "create_memory"
  | "update_memory"
  | "supersede_memory"
  | "create_task"
  | "update_task"
  | "link_entity"
  | "delete_entity"
  | "consolidate_memory"
  | "inspect_raw_item";

export interface AiOperationPolicy {
  mode: AiAutonomyMode;
  autoApplyMinConfidence: number;
  reviewBelowConfidence: number;
  requireReviewForDestructive: boolean;
  requireReviewForSensitive: boolean;
  requireReviewForConflicts: boolean;
  requireReviewForBulkChanges: boolean;
  maxAutoApplyBatchSize: number;
}

export interface AiOperationSignal {
  operationType: AiOperationType;
  confidence: number;
  sourceReliability: number;
  hasSourceQuote: boolean;
  userExplicitlyRequested: boolean;
  destructive: boolean;
  reversible: boolean;
  bulkCount: number;
  conflicts: unknown[];
  ambiguousTargets: unknown[];
  sensitiveFlags: string[];
  projectResolved: boolean;
  possiblyImportant?: boolean;
}

export const defaultAiOperationPolicies: Record<AiAutonomyMode, AiOperationPolicy> = {
  conservative: {
    mode: "conservative",
    autoApplyMinConfidence: 0.9,
    reviewBelowConfidence: 0.75,
    requireReviewForDestructive: true,
    requireReviewForSensitive: true,
    requireReviewForConflicts: true,
    requireReviewForBulkChanges: true,
    maxAutoApplyBatchSize: 3
  },
  balanced: {
    mode: "balanced",
    autoApplyMinConfidence: 0.82,
    reviewBelowConfidence: 0.65,
    requireReviewForDestructive: true,
    requireReviewForSensitive: true,
    requireReviewForConflicts: true,
    requireReviewForBulkChanges: true,
    maxAutoApplyBatchSize: 10
  },
  autopilot: {
    mode: "autopilot",
    autoApplyMinConfidence: 0.72,
    reviewBelowConfidence: 0.5,
    requireReviewForDestructive: true,
    requireReviewForSensitive: true,
    requireReviewForConflicts: true,
    requireReviewForBulkChanges: true,
    maxAutoApplyBatchSize: 50
  }
};

export const sourceReliabilityDefaults = {
  direct_user_command: 0.95,
  manual_note: 0.9,
  confirmed_project_task_update: 0.9,
  uploaded_document: 0.8,
  backfilled_raw_capture: 0.75,
  assistant_generated_summary: 0.45,
  unclear_imported_text: 0.4
} as const;

export function getDefaultAiOperationPolicy(mode: AiAutonomyMode = "balanced"): AiOperationPolicy {
  return defaultAiOperationPolicies[mode];
}

export function decideAiOperation(policy: AiOperationPolicy, operation: AiOperationSignal): AiOperationDecision {
  if (operation.destructive && policy.requireReviewForDestructive) return "needs_review";
  if (operation.sensitiveFlags.length > 0 && policy.requireReviewForSensitive) return "needs_review";
  if (operation.conflicts.length > 0 && policy.requireReviewForConflicts) return "needs_review";
  if (operation.ambiguousTargets.length > 0) return "needs_review";
  if (operation.bulkCount > policy.maxAutoApplyBatchSize && policy.requireReviewForBulkChanges) return "needs_review";

  if (!operation.projectResolved && requiresResolvedProject(operation.operationType)) {
    return operation.confidence >= policy.reviewBelowConfidence ? "needs_review" : "reject_or_ignore";
  }

  if (operation.confidence < policy.reviewBelowConfidence) {
    return operation.possiblyImportant ? "needs_review" : "reject_or_ignore";
  }

  if (operation.userExplicitlyRequested && operation.reversible && operation.bulkCount <= policy.maxAutoApplyBatchSize) {
    return operation.confidence >= policy.reviewBelowConfidence ? "auto_apply_with_audit" : "reject_or_ignore";
  }

  if (operation.operationType === "create_memory" && !operation.hasSourceQuote) {
    if (policy.mode === "autopilot" && operation.confidence >= policy.autoApplyMinConfidence + 0.08 && operation.sourceReliability >= 0.9) {
      return "auto_apply_with_audit";
    }
    return operation.confidence >= policy.reviewBelowConfidence ? "needs_review" : "reject_or_ignore";
  }

  if (operation.confidence >= policy.autoApplyMinConfidence && operation.sourceReliability >= sourceReliabilityFloor(policy.mode)) {
    return operation.reversible ? "auto_apply_with_audit" : "auto_apply";
  }

  if (policy.mode === "autopilot" && operation.reversible && operation.sourceReliability >= 0.65) {
    return "auto_apply_with_audit";
  }

  return operation.reversible && policy.mode === "balanced" && operation.operationType !== "create_memory"
    ? "auto_apply_with_audit"
    : "needs_review";
}

function requiresResolvedProject(operationType: AiOperationType) {
  return operationType === "link_entity";
}

function sourceReliabilityFloor(mode: AiAutonomyMode) {
  if (mode === "conservative") return 0.8;
  if (mode === "autopilot") return 0.55;
  return 0.7;
}
