import { describe, expect, it } from "vitest";

import { createOnboardingStore } from "./onboarding-store";

describe("onboarding store", () => {
  it("publishes one validated screen at a time", () => {
    const store = createOnboardingStore();

    store.setState({ screen: "runtime-choice" });

    expect(store.state$.peek()).toEqual({ screen: "runtime-choice" });
    store.reset();
    expect(store.state$.peek()).toEqual({ screen: "welcome" });
  });
});
