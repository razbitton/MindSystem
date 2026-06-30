import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "./types.js";

const bullmq = vi.hoisted(() => {
  const add = vi.fn();
  const Queue = vi.fn(() => ({ add }));
  return { add, Queue };
});

vi.mock("bullmq", () => ({
  Queue: bullmq.Queue
}));

describe("queues", () => {
  afterEach(() => {
    bullmq.add.mockClear();
    bullmq.Queue.mockClear();
    vi.resetModules();
  });

  it("uses a BullMQ-safe custom id for AI processing jobs", async () => {
    const { enqueueAiProcessingRun } = await import("./queues.js");

    await enqueueAiProcessingRun({
      workspaceId: "workspace-id",
      env: {
        REDIS_URL: "redis://localhost:6379"
      }
    } as AppContext, "run-id");

    expect(bullmq.add).toHaveBeenCalledWith(
      "run_memory_backfill",
      { runId: "run-id", workspaceId: "workspace-id" },
      { jobId: "ai-processing-run-run-id", attempts: 1 }
    );
    expect(bullmq.add.mock.calls[0]?.[2]?.jobId).not.toContain(":");
  });
});
