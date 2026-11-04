import { describe, expect, it, vi } from "vitest";

import SecureSignerModule from "./vibe-pad-secure-signer-module";

vi.mock("expo", () => ({
  requireOptionalNativeModule: () => null,
}));

describe("VibePad Secure Signer native linkage", () => {
  it("defers a missing native module error until a signing operation", async () => {
    await expect(
      SecureSignerModule.getOrCreateKeyAsync("production.installation")
    ).rejects.toThrow("Device-bound VibePad signing is unavailable");
  });
});
