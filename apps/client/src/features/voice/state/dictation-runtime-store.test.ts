import { describe, expect, it } from "vitest";

import { createDictationRuntimeStore } from "./dictation-runtime-store";

describe("Legend dictation runtime store", () => {
  it("gates lifecycle transitions", () => {
    const store = createDictationRuntimeStore();

    expect(store.begin()).toBe(true);
    expect(store.begin()).toBe(false);
    store.setPhase("recording");
    expect(store.beginProcessing()).toBe(true);
    expect(store.beginProcessing()).toBe(false);
    store.reset();

    expect(store.state$.peek()).toEqual({
      errorMessage: undefined,
      interimText: "",
      phase: "idle",
    });
  });

  it("updates interim copy without notifying lifecycle leaves", () => {
    const store = createDictationRuntimeStore();
    let interimNotifications = 0;
    let phaseNotifications = 0;
    const disposeInterim = store.state$.interimText.onChange(() => {
      interimNotifications += 1;
    });
    const disposePhase = store.state$.phase.onChange(() => {
      phaseNotifications += 1;
    });

    store.setInterimText("testing one two");

    expect(interimNotifications).toBe(1);
    expect(phaseNotifications).toBe(0);
    disposeInterim();
    disposePhase();
  });
});
