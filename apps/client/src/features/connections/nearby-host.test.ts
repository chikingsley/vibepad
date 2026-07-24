import { describe, expect, it } from "vitest";

import { nearbyHostFromService } from "./nearby-host";

describe("nearby VibePad hosts", () => {
  it("turns a Bonjour service into reachable endpoint candidates", () => {
    expect(
      nearbyHostFromService({
        addresses: ["192.168.1.12", "fe80::12"],
        hostName: "gmk.local.",
        name: "gmk",
        port: 4100,
        txt: { hostid: "gmk", hostname: "GMK", version: "1" },
      })
    ).toEqual({
      endpoints: ["http://gmk.local.:4100", "http://192.168.1.12:4100"],
      id: "gmk",
      name: "GMK",
    });
  });

  it("normalizes a short Bonjour host name to the local domain", () => {
    expect(
      nearbyHostFromService({
        addresses: ["192.168.1.12"],
        hostName: "gmk",
        name: "gmk",
        port: 4100,
        txt: { hostid: "gmk", hostname: "GMK", version: "1" },
      })?.endpoints
    ).toEqual(["http://gmk.local:4100", "http://192.168.1.12:4100"]);
  });

  it("ignores unrelated service versions", () => {
    expect(
      nearbyHostFromService({
        addresses: ["192.168.1.12"],
        hostName: "printer.local.",
        name: "Printer",
        port: 80,
        txt: {},
      })
    ).toBeUndefined();
  });
});
