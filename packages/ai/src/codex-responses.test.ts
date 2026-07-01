import { describe, expect, it } from "vitest";
import { extractCodexResponseTextFromBody } from "./codex-responses.js";

describe("Codex Responses helpers", () => {
  it("extracts output text from a JSON response body", () => {
    const body = JSON.stringify({
      output_text: JSON.stringify({ searchQuery: "supplier pricing", keywords: ["supplier"] })
    });

    expect(extractCodexResponseTextFromBody(body)).toBe(JSON.stringify({
      searchQuery: "supplier pricing",
      keywords: ["supplier"]
    }));
  });

  it("extracts output text from streaming output_text.done events", () => {
    const text = JSON.stringify({ searchQuery: "wedding vendors", keywords: ["wedding"] });
    const body = [
      "event: response.output_text.done",
      `data: ${JSON.stringify({ type: "response.output_text.done", text })}`,
      "",
      "event: done",
      "data: [DONE]"
    ].join("\n");

    expect(extractCodexResponseTextFromBody(body)).toBe(text);
  });

  it("joins streaming output text deltas when no final text event is present", () => {
    const body = [
      "event: response.output_text.delta",
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "{\"keywords\":" })}`,
      "",
      "event: response.output_text.delta",
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "[\"supplier\"]}" })}`,
      "",
      "event: done",
      "data: [DONE]"
    ].join("\n");

    expect(extractCodexResponseTextFromBody(body)).toBe("{\"keywords\":[\"supplier\"]}");
  });
});
