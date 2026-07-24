import { describe, expect, it } from "vitest";

import {
  assertSafeBindAddress,
  type CommandRunner,
  discoverHostTools,
  discoverTailscaleIdentity,
  parseTailscaleIPv4,
  selectLanIPv4,
} from "./service-discovery";

describe("VibePad Host network discovery", () => {
  it("derives an exact bind address and short MagicDNS host name", async () => {
    const runner: CommandRunner = (_executable, args) => {
      if (args[0] === "ip") {
        return Promise.resolve({
          exitCode: 0,
          stderr: "",
          stdout: "100.121.185.11\n",
        });
      }
      return Promise.resolve({
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          Self: {
            DNSName: "gmk.tailbce39f.ts.net.",
            HostName: "gmk-server",
          },
        }),
      });
    };

    await expect(discoverTailscaleIdentity(runner)).resolves.toEqual({
      bindAddress: "100.121.185.11",
      dnsName: "gmk.tailbce39f.ts.net",
      hostName: "gmk",
    });
  });

  it("rejects a missing IPv4 and an accidental public bind", () => {
    expect(() => parseTailscaleIPv4("fd7a:115c:a1e0::1")).toThrow(
      "Tailscale did not report an IPv4 address"
    );
    expect(() => assertSafeBindAddress("0.0.0.0", false)).toThrow(
      "requires --allow-public-bind"
    );
    expect(() => assertSafeBindAddress("0.0.0.0", true)).not.toThrow();
  });

  it("selects a physical LAN address ahead of virtual interfaces", () => {
    expect(
      selectLanIPv4({
        "br-container": [
          {
            address: "172.18.0.1",
            cidr: "172.18.0.1/16",
            family: "IPv4",
            internal: false,
            mac: "00:00:00:00:00:00",
            netmask: "255.255.0.0",
          },
        ],
        en0: [
          {
            address: "192.168.1.12",
            cidr: "192.168.1.12/24",
            family: "IPv4",
            internal: false,
            mac: "00:00:00:00:00:01",
            netmask: "255.255.255.0",
          },
        ],
      })
    ).toBe("192.168.1.12");
  });

  it("keeps Tailscale optional in the host tool inventory", async () => {
    const runner: CommandRunner = () =>
      Promise.resolve({ exitCode: 1, stderr: "", stdout: "" });

    await expect(discoverHostTools(runner, "/usr/bin/bun")).resolves.toEqual({
      bun: "/usr/bin/bun",
    });
  });
});
