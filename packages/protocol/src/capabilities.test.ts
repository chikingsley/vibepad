import { describe, expect, it } from "vitest";

import { capabilityIds, providerManifestSchema } from "./capabilities";

describe("provider manifest contract", () => {
  it("rejects a provider that silently omits a known capability", () => {
    const capabilities = Object.fromEntries(
      capabilityIds.slice(1).map((id) => [id, { state: "supported" }])
    );

    const result = providerManifestSchema.safeParse({
      capabilities,
      controls: [],
      displayName: "Incomplete provider",
      id: "incomplete",
      protocolVersion: 1,
    });

    expect(result.success).toBe(false);
  });
});
