import { describe, expect, it } from "vitest";
import { createMindSystemOpenAIResponse } from "./openai.js";
import type { MindSystemClient, TurnDeltaInput } from "./index.js";

describe("createMindSystemOpenAIResponse", () => {
  it("does not store assistant output by default", async () => {
    const stored: TurnDeltaInput[] = [];
    const mind = createMindClient(stored);

    await createMindSystemOpenAIResponse({
      mind,
      createResponse: async () => ({ output_text: "Assistant speculation" })
    }, {
      model: "gpt-test",
      message: "What do I prefer?"
    });

    expect(stored).toHaveLength(0);
  });

  it("stores turn delta only when explicitly requested", async () => {
    const stored: TurnDeltaInput[] = [];
    const mind = createMindClient(stored);

    await createMindSystemOpenAIResponse({
      mind,
      createResponse: async () => ({ output_text: "Confirmed answer" })
    }, {
      model: "gpt-test",
      message: "Remember this durable fact",
      storeTurnDelta: true
    });

    expect(stored).toHaveLength(1);
    expect(stored[0]?.assistantMessage).toBe("Confirmed answer");
  });
});

function createMindClient(stored: TurnDeltaInput[]) {
  return {
    prepareTurnContext: async () => ({ contextMarkdown: "# Context" }),
    storeTurnDelta: async (input: TurnDeltaInput) => {
      stored.push(input);
      return {};
    }
  } as unknown as MindSystemClient;
}
