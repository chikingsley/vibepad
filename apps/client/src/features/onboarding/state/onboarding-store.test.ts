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

  it("accepts the terminal empty discovery state", () => {
    const store = createOnboardingStore();

    store.setState({
      discovery: { status: "empty" },
      screen: "computer-choice",
    });

    expect(store.state$.peek()).toEqual({
      discovery: { status: "empty" },
      screen: "computer-choice",
    });
  });

  it("accepts a real discovery error distinct from permission denial", () => {
    const store = createOnboardingStore();

    store.setState({
      discovery: { message: "Nearby discovery failed", status: "error" },
      screen: "computer-choice",
    });

    expect(store.state$.peek()).toEqual({
      discovery: { message: "Nearby discovery failed", status: "error" },
      screen: "computer-choice",
    });
  });
});
