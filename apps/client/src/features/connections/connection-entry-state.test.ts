import {
  createDefaultAppSettings,
  createHostProfile,
} from "@vibepad/protocol/settings";
import { describe, expect, it } from "vitest";

import { resolveConnectionEntryState } from "./connection-entry-state";

const { connections } = createDefaultAppSettings();

describe("connection entry state", () => {
  it("holds the workspace while settings hydrate", () => {
    expect(resolveConnectionEntryState(connections, "loading")).toEqual({
      status: "loading",
    });
  });

  it("opens activation for a fresh device", () => {
    expect(resolveConnectionEntryState(connections, "ready")).toEqual({
      status: "activation",
    });
  });

  it("opens activation when the active host reference is stale", () => {
    expect(
      resolveConnectionEntryState(
        { activeHostId: "retired-host", hosts: [] },
        "ready"
      )
    ).toEqual({ status: "activation" });
  });

  it("opens the saved active host after hydration", () => {
    const host = createHostProfile({
      id: "gmk",
      name: "GMK",
      url: "http://gmk:4100",
    });
    expect(
      resolveConnectionEntryState(
        { activeHostId: host.id, hosts: [host] },
        "ready"
      )
    ).toEqual({ host, status: "workspace" });
  });

  it("keeps a settings read failure actionable", () => {
    expect(
      resolveConnectionEntryState(connections, "error", "Storage unavailable")
    ).toEqual({
      errorMessage: "Storage unavailable",
      status: "activation",
    });
  });
});
