import {
  agentMemoryBootstrapInstructions,
  agentMemoryPolicyText,
  agentMemoryPrimaryTools,
  agentMemoryWorkflow
} from "@personal-context-os/shared";
import type { AppContext } from "./types.js";

export function getAgentBootstrap(context: AppContext) {
  return {
    server: {
      name: "Personal Context OS",
      version: "0.1.0",
      apiBaseUrl: context.env.API_BASE_URL,
      mcpServerUrl: context.env.MCP_SERVER_URL,
      modelAuthMode: context.env.OPENAI_AUTH_MODE
    },
    instructions: agentMemoryBootstrapInstructions,
    memoryPolicy: agentMemoryPolicyText,
    workflow: agentMemoryWorkflow,
    primaryTools: agentMemoryPrimaryTools,
    mcp: {
      initializeProvidesInstructions: true,
      policyResources: ["agent-bootstrap://memory", "memory-policy://agent"],
      prompts: ["memory_workflow"]
    },
    api: {
      bootstrapEndpoint: "/api/agents/bootstrap",
      contextEndpoint: "/api/memory/context",
      recallEndpoint: "/api/memory/recall",
      storeEndpoint: "/api/memory/store",
      supersedeEndpointTemplate: "/api/memory/{id}/supersede",
      linkEndpoint: "/api/memory/link"
    },
    modelAuth: {
      mode: context.env.OPENAI_AUTH_MODE,
      codexStatusEndpoint: "/api/openai-codex/status",
      codexOAuthStartEndpoint: "/api/openai-codex/oauth/start",
      codexOAuthPollEndpoint: "/api/openai-codex/oauth/poll",
      note: "OpenAI Codex OAuth is used internally for memory extraction when OPENAI_AUTH_MODE=codex. Embeddings still require OpenAI Platform API-key auth or another embedding provider."
    },
    scopes: {
      read: "memory:read",
      write: "memory:write"
    }
  };
}
