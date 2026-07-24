import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { startHostDiscovery } from "./host-discovery";

describe("host discovery", () => {
  it("uses the macOS system discovery service and stops it cleanly", () => {
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(() => true),
    });
    const spawnProcess = vi.fn(() => child);

    const discovery = startHostDiscovery({
      hostId: "hojo-id",
      hostName: "HoJo",
      platform: "darwin",
      port: 4100,
      spawnProcess:
        spawnProcess as unknown as typeof import("node:child_process").spawn,
    });

    expect(spawnProcess).toHaveBeenCalledWith(
      "/usr/bin/dns-sd",
      [
        "-R",
        "HoJo",
        "_vibepad._tcp",
        "local.",
        "4100",
        "hostid=hojo-id",
        "hostname=HoJo",
        "version=1",
      ],
      { stdio: "ignore" }
    );

    discovery.stop();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
