import { describe, expect, it } from "vitest";

import {
  normalizeFeedbackPoint,
  shouldAppendFeedbackPoint,
} from "./feedback-points";

describe("preview feedback points", () => {
  it("normalizes coordinates and retains pointer metadata", () => {
    expect(
      normalizeFeedbackPoint(
        { pointer: "pencil", pressure: 0.7, x: 240, y: 90 },
        { height: 180, width: 320 }
      )
    ).toEqual({ pointer: "pencil", pressure: 0.7, x: 0.75, y: 0.5 });
  });

  it("decimates only points below the configured movement threshold", () => {
    const previous = {
      pointer: "touch" as const,
      pressure: 0.5,
      x: 0.5,
      y: 0.5,
    };

    expect(
      shouldAppendFeedbackPoint(previous, {
        ...previous,
        x: 0.5005,
        y: 0.5005,
      })
    ).toBe(false);
    expect(
      shouldAppendFeedbackPoint(previous, {
        ...previous,
        x: 0.502,
      })
    ).toBe(true);
  });
});
