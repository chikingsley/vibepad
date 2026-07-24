import { createHostProfile } from "@vibepad/protocol/settings";
import { describe, expect, it } from "vitest";

import {
  computerConnectionRegistry,
  computerStatusDotClass,
  computerStatusLabel,
  reconcileComputerRecords,
  reportComputerConnection,
} from "./computer-connections";

describe("computer connection reporting", () => {
  it("stamps the connection time when a computer connects", () => {
    reportComputerConnection("report-stamp", "connected");

    const record =
      computerConnectionRegistry.state$.byHostId["report-stamp"]?.peek();
    expect(record?.status).toBe("connected");
    expect(record?.lastConnectedAt).toBeGreaterThan(0);
  });

  it("preserves the last connection time when a computer drops offline", () => {
    reportComputerConnection("report-drop", "connected");
    const connectedAt =
      computerConnectionRegistry.state$.byHostId["report-drop"]?.peek()
        ?.lastConnectedAt;

    reportComputerConnection("report-drop", "offline", "unreachable");

    const record =
      computerConnectionRegistry.state$.byHostId["report-drop"]?.peek();
    expect(record?.status).toBe("offline");
    expect(record?.errorMessage).toBe("unreachable");
    expect(record?.lastConnectedAt).toBe(connectedAt);
  });

  it("removes records for computers that are no longer saved", () => {
    reportComputerConnection("report-kept", "connected");
    reportComputerConnection("report-stale", "offline");

    reconcileComputerRecords([
      createHostProfile({
        id: "report-kept",
        name: "kept",
        url: "http://kept:4100",
      }),
    ]);

    const records = computerConnectionRegistry.state$.byHostId.peek();
    expect(records["report-kept"]).toBeDefined();
    expect(records["report-stale"]).toBeUndefined();
  });
});

describe("computer status presentation", () => {
  it("maps every status to a distinct dot", () => {
    expect(computerStatusDotClass("connected")).toBe("bg-emerald-400");
    expect(computerStatusDotClass("connecting")).toBe("bg-sky-400");
    expect(computerStatusDotClass("starting-host")).toBe("bg-sky-400");
    expect(computerStatusDotClass("offline")).toBe("bg-red-400");
    expect(computerStatusDotClass("attention")).toBe("bg-amber-400");
    expect(computerStatusDotClass(undefined)).toBe("bg-muted-foreground/60");
  });

  it("reads the starting status as words", () => {
    expect(computerStatusLabel("starting-host")).toBe("starting host");
    expect(computerStatusLabel("connected")).toBe("connected");
    expect(computerStatusLabel(undefined)).toBeUndefined();
  });
});
