import { describe, expect, it } from "vitest";

import { createTimelineDisclosureStore } from "./timeline-disclosure-store";

describe("Legend timeline disclosure store", () => {
  it("isolates disclosures and sessions", () => {
    const store = createTimelineDisclosureStore();
    store.setOpen("session-a", "shell:a", false);
    store.setOpen("session-a", "tool:b", false);
    store.setOpen("session-b", "shell:a", false);
    const shellA$ = store.state$.bySessionId["session-a"]?.["shell:a"];
    const toolA$ = store.state$.bySessionId["session-a"]?.["tool:b"];
    const shellB$ = store.state$.bySessionId["session-b"]?.["shell:a"];
    if (!(shellA$ && toolA$ && shellB$)) {
      throw new Error("Legend did not create timeline disclosure keys");
    }
    let shellANotifications = 0;
    let toolANotifications = 0;
    let shellBNotifications = 0;
    const disposeShellA = shellA$.onChange(() => {
      shellANotifications += 1;
    });
    const disposeToolA = toolA$.onChange(() => {
      toolANotifications += 1;
    });
    const disposeShellB = shellB$.onChange(() => {
      shellBNotifications += 1;
    });

    store.toggle("session-a", "shell:a");

    expect(store.isOpen("session-a", "shell:a")).toBe(true);
    expect(store.isOpen("session-a", "tool:b")).toBe(false);
    expect(store.isOpen("session-b", "shell:a")).toBe(false);
    expect(shellANotifications).toBe(1);
    expect(toolANotifications).toBe(0);
    expect(shellBNotifications).toBe(0);
    disposeShellA();
    disposeToolA();
    disposeShellB();
  });

  it("retains expansion until its session is cleared", () => {
    const store = createTimelineDisclosureStore();
    store.setOpen("session", "reasoning:item", true);

    expect(store.isOpen("session", "reasoning:item")).toBe(true);

    store.clearSession("session");

    expect(store.isOpen("session", "reasoning:item")).toBe(false);
  });
});
