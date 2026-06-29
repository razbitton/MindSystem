import { afterEach, describe, expect, it, vi } from "vitest";
import { startOpenAICodexOAuth } from "./openai-codex.js";
import type { AppContext } from "./types.js";

describe("OpenAI Codex OAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a string polling interval from OpenAI device auth", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      device_auth_id: "device-auth-id",
      user_code: "ABCD-EFGH",
      interval: "5"
    }), { status: 200 })));

    const response = await startOpenAICodexOAuth({
      userId: "user-id",
      env: {
        OPENAI_CODEX_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
      }
    } as AppContext);

    expect(response.deviceAuthId).toBe("device-auth-id");
    expect(response.userCode).toBe("ABCD-EFGH");
    expect(response.intervalMs).toBe(5000);
  });
});
