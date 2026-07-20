import { describe, expect, it } from "vitest";

import { createSessionComposerStore } from "./session-composer-store";

describe("Legend session composer store", () => {
  it("preserves drafts independently across session remounts", () => {
    const store = createSessionComposerStore();
    store.setDraft("session-a", "draft a");
    store.setSelection("session-a", { end: 7, start: 7 });
    store.setDraft("session-b", "draft b");
    const sessionA$ = store.state$.bySessionId["session-a"];
    const sessionB$ = store.state$.bySessionId["session-b"];
    if (!(sessionA$ && sessionB$)) {
      throw new Error("Legend did not create session composer keys");
    }
    let sessionANotifications = 0;
    let sessionBNotifications = 0;
    const disposeA = sessionA$.onChange(() => {
      sessionANotifications += 1;
    });
    const disposeB = sessionB$.onChange(() => {
      sessionBNotifications += 1;
    });

    store.setDraft("session-a", "draft a, edited");

    expect(store.record("session-a")).toMatchObject({
      draft: "draft a, edited",
      selection: { end: 7, start: 7 },
    });
    expect(store.record("session-b").draft).toBe("draft b");
    expect(sessionANotifications).toBe(1);
    expect(sessionBNotifications).toBe(0);
    disposeA();
    disposeB();
  });

  it("clears the submitted draft while preserving edits made in flight", () => {
    const store = createSessionComposerStore();
    store.setDraft("session", "first");
    expect(store.beginSend("session")).toBe(true);
    expect(store.beginSend("session")).toBe(false);
    store.setDraft("session", "first plus more");
    store.completeSend("session", "first");

    expect(store.record("session")).toMatchObject({
      draft: "first plus more",
      sending: false,
    });

    expect(store.beginSend("session")).toBe(true);
    store.completeSend("session", "first plus more");

    expect(store.record("session")).toMatchObject({
      draft: "",
      selection: { end: 0, start: 0 },
      sending: false,
    });
  });
});
