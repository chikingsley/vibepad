import type { ProviderCatalog } from "@vibepad/protocol/catalog";
import type { ServiceSummary } from "@vibepad/protocol/provider";
import { describe, expect, it } from "vitest";

import { createProjectResourcesStore } from "./project-resources-store";

const catalog = (providerId: string): ProviderCatalog => ({
  agents: [],
  commands: [],
  models: [],
  providers: [
    { disabled: false, id: providerId, name: providerId, native: null },
  ],
  skills: [],
});

const service = (id: string): ServiceSummary => ({
  category: "mcp",
  id,
  label: id,
  state: "ready",
});

describe("Legend project resources store", () => {
  it("keeps project subscriptions isolated and reuses ready data", async () => {
    const projectAId = "projectA";
    const projectBId = "projectB";
    let serviceLoads = 0;
    const store = createProjectResourcesStore({
      listServices: (projectId) => {
        serviceLoads += 1;
        return Promise.resolve([service(projectId)]);
      },
      loadCatalog: (projectId) => Promise.resolve(catalog(projectId)),
    });
    let projectANotifications = 0;
    let projectBNotifications = 0;
    const projectA$ = store.state$.servicesByProjectId[projectAId];
    const projectB$ = store.state$.servicesByProjectId[projectBId];
    if (!(projectA$ && projectB$)) {
      throw new Error("Legend did not create observable project keys");
    }
    const disposeA = projectA$.onChange(() => {
      projectANotifications += 1;
    });
    const disposeB = projectB$.onChange(() => {
      projectBNotifications += 1;
    });

    await store.loadServices(projectAId);
    await store.loadServices(projectAId);

    expect(projectA$.peek()).toEqual({
      data: [service(projectAId)],
      status: "ready",
    });
    expect(serviceLoads).toBe(1);
    expect(projectANotifications).toBe(2);
    expect(projectBNotifications).toBe(0);
    disposeA();
    disposeB();
  });

  it("keeps the newest catalog when an aborted request resolves late", async () => {
    const projectId = "projectA";
    const releases: Array<(value: ProviderCatalog) => void> = [];
    const store = createProjectResourcesStore({
      listServices: () => Promise.resolve([]),
      loadCatalog: () =>
        new Promise<ProviderCatalog>((resolve) => {
          releases.push(resolve);
        }),
    });

    const first = store.loadCatalog(projectId);
    const second = store.loadCatalog(projectId, true);
    releases[1]?.(catalog("new"));
    await second;
    releases[0]?.(catalog("old"));
    await first;

    expect(store.state$.catalogsByProjectId[projectId]?.peek()).toEqual({
      data: catalog("new"),
      status: "ready",
    });
  });

  it("aborts pending work when the host runtime is disposed", () => {
    let observedSignal: AbortSignal | undefined;
    const store = createProjectResourcesStore({
      listServices: async (_projectId, signal) => {
        observedSignal = signal;
        await new Promise(() => undefined);
        return [];
      },
      loadCatalog: (projectId) => Promise.resolve(catalog(projectId)),
    });

    store.loadServices("projectA").catch(() => undefined);
    store.cancelPending();

    expect(observedSignal?.aborted).toBe(true);
  });
});
