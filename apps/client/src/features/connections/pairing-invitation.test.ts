import { createHostProfile } from "@vibepad/protocol/settings";
import { describe, expect, it } from "vitest";

import { connectionsWithPairedHost } from "./pairing-invitation";

describe("pairing a host invitation", () => {
  it("saves a new computer and makes it active", () => {
    const next = connectionsWithPairedHost(
      { activeHostId: null, hosts: [] },
      { hostId: "studio", hostName: "Studio" },
      "http://studio:4100"
    );

    expect(next.activeHostId).toBe("studio");
    expect(next.hosts).toHaveLength(1);
    expect(next.hosts[0]?.name).toBe("Studio");
    expect(next.hosts[0]?.url).toBe("http://studio:4100");
  });

  it("keeps other saved computers", () => {
    const laptop = createHostProfile({
      id: "laptop",
      name: "Laptop",
      url: "http://laptop:4100",
    });

    const next = connectionsWithPairedHost(
      { activeHostId: "laptop", hosts: [laptop] },
      { hostId: "studio", hostName: "Studio" },
      "http://studio:4100"
    );

    expect(next.activeHostId).toBe("studio");
    expect(next.hosts.map((host) => host.id)).toEqual(["laptop", "studio"]);
  });

  it("preserves automatic start when re-pairing a known computer", () => {
    const studio = createHostProfile({
      automaticStart: {
        enabled: true,
        recoveryKeyId: "recovery-key",
        ssh: { host: "studio", port: 22, username: "simon" },
      },
      id: "studio",
      name: "Old Studio",
      url: "http://old-studio:4100",
    });

    const next = connectionsWithPairedHost(
      { activeHostId: null, hosts: [studio] },
      { hostId: "studio", hostName: "Studio" },
      "http://studio:4100"
    );

    expect(next.hosts).toHaveLength(1);
    expect(next.hosts[0]?.url).toBe("http://studio:4100");
    expect(next.hosts[0]?.name).toBe("Studio");
    expect(next.hosts[0]?.automaticStart.enabled).toBe(true);
    expect(next.hosts[0]?.automaticStart.recoveryKeyId).toBe("recovery-key");
  });
});
