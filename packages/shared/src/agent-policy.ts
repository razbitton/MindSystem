export const agentMemoryPolicyText = [
  "# Agent Memory Policy",
  "",
  "- Call `prepare_turn_context` before answering when the user refers to prior work, people, projects, decisions, preferences, constraints, tasks, or ambiguous pronouns. `get_relevant_context` is a compatibility alias.",
  "- Prefer `recall_memory` over `search_memory` for intent resolution and semantic recall.",
  "- Use `store_memory` only for durable information that should affect future turns: facts, decisions, preferences, constraints, commitments, open questions, project updates, people, and topic notes.",
  "- Keep stored memories atomic. Split unrelated facts into separate candidates.",
  "- Use `supersede_memory` when new information replaces older memory. Do not delete historical memory just because it changed.",
  "- Use `link_memory` when a memory is clearly related to a project, person, decision, task, document, or another memory.",
  "- Do not store secrets, passwords, tokens, payment data, or highly sensitive personal data unless the user explicitly asks to remember it.",
  "- Treat low-confidence or degraded results as uncertain and ask a clarifying question when the missing detail affects the action."
].join("\n");

export const agentMemoryBootstrapInstructions = [
  "# Personal Context OS Agent Bootstrap",
  "",
  "You are connected to Personal Context OS, a durable memory and context system for AI agents.",
  "Use it as the source of truth for prior user context before relying on assumptions or limited chat history.",
  "",
  "Core workflow:",
  "",
  "1. At the start of a user turn, call `prepare_turn_context` when the request may depend on prior context, active projects, people, decisions, preferences, constraints, open tasks, open questions, or ambiguous references.",
  "2. Use `recall_memory` for targeted semantic lookup when you need more detail than the context bundle provides.",
  "3. Use `store_memory` after the user states durable facts, decisions, preferences, constraints, commitments, project updates, people information, topic notes, or open questions that should affect future turns.",
  "4. Use `supersede_memory` when new information replaces older memory, preserving history instead of deleting the older record.",
  "5. Use `link_memory` when a memory should be explicitly connected to a project, person, task, document, decision, or another memory.",
  "",
  "Compatibility: `get_relevant_context` is still available and calls the same broker path for older clients.",
  "",
  "Operational rules:",
  "",
  "- Keep memory records atomic and specific.",
  "- Treat low-confidence, conflicting, or degraded retrieval as uncertainty; ask a clarifying question when it affects the next action.",
  "- Do not store secrets, passwords, tokens, payment data, or highly sensitive personal data unless the user explicitly asks you to remember it.",
  "- Do not expose internal IDs to the user unless they are useful for the requested operation.",
  "- Prefer the high-level memory tools over raw list/search tools for agent reasoning."
].join("\n");

export const agentMemoryWorkflow = [
  {
    step: "retrieve_context",
    when: "The user request may depend on prior context or has ambiguous references.",
    action: "Call prepare_turn_context with the current message, recentMessages, and activeProjectId when available."
  },
  {
    step: "targeted_recall",
    when: "The first context bundle is too broad or missing a specific detail.",
    action: "Call recall_memory with a focused natural-language query and relevant filters."
  },
  {
    step: "answer_or_act",
    when: "Relevant context is available or the request is standalone.",
    action: "Use retrieved memory as context, while marking uncertainty when retrieval is degraded or conflicting."
  },
  {
    step: "store_durable_memory",
    when: "The user gives durable future-relevant information.",
    action: "Call store_memory with text or structured candidates."
  },
  {
    step: "update_memory",
    when: "The user corrects or replaces older durable information.",
    action: "Call supersede_memory instead of deleting the old memory."
  }
] as const;

export const agentMemoryPrimaryTools = [
  {
    name: "prepare_turn_context",
    scope: "memory:read",
    purpose: "Build a compact context pack for the current agent turn."
  },
  {
    name: "recall_memory",
    scope: "memory:read",
    purpose: "Run focused provider-aware memory retrieval."
  },
  {
    name: "store_memory",
    scope: "memory:write",
    purpose: "Store durable facts, decisions, preferences, constraints, commitments, updates, people, notes, and open questions."
  },
  {
    name: "supersede_memory",
    scope: "memory:write",
    purpose: "Replace older memory while preserving history."
  },
  {
    name: "link_memory",
    scope: "memory:write",
    purpose: "Create explicit relationships between memories and entities."
  }
] as const;
