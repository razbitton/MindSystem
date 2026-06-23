import { describe, expect, it } from "vitest";
import { s3SigningRegion } from "./documents.js";

describe("s3SigningRegion", () => {
  it("uses Cloudflare R2's auto region when no explicit region is configured", () => {
    expect(s3SigningRegion("https://account-id.r2.cloudflarestorage.com", "us-east-1")).toBe("auto");
  });

  it("keeps explicitly configured S3-compatible regions", () => {
    expect(s3SigningRegion("https://nyc3.digitaloceanspaces.com", "nyc3")).toBe("nyc3");
  });
});
