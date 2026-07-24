import { describe, expect, it } from "vitest";

import { createComputerConnectionRegistry } from "./computer-connection-registry";

describe("computer connection registry", () => {
  it("isolates status updates by host identity", () => {
    const laptopId = "laptop";
    const studioId = "studio";
    const registry = createComputerConnectionRegistry();
    registry.set({
      hostId: "studio",
      lastConnectedAt: null,
      status: "connecting",
    });
    registry.set({
      hostId: "laptop",
      lastConnectedAt: 123,
      status: "connected",
    });
    let laptopNotifications = 0;
    const dispose = registry.state$.byHostId[laptopId]?.onChange(() => {
      laptopNotifications += 1;
    });

    registry.set({
      errorMessage: "Computer is offline",
      hostId: "studio",
      lastConnectedAt: null,
      status: "offline",
    });

    expect(registry.state$.byHostId[studioId]?.status.peek()).toBe("offline");
    expect(registry.state$.byHostId[laptopId]?.status.peek()).toBe("connected");
    expect(laptopNotifications).toBe(0);
    dispose?.();
  });
});
