import { describe, expect, it } from "vitest";

import {
  isMessageScrollDetached,
  messageAnchorOffset,
  messageReadingPosition,
  messageScrollDistanceFromBottom,
} from "./message-scroll-state";

describe("message scroll state", () => {
  it("shows jump-to-latest only after the reader leaves the tail threshold", () => {
    expect(
      isMessageScrollDetached({
        contentSize: 1800,
        offset: 1104,
        viewportSize: 600,
      })
    ).toBe(false);
    expect(
      isMessageScrollDetached({
        contentSize: 1800,
        offset: 1000,
        viewportSize: 600,
      })
    ).toBe(true);
  });

  it("clamps distance and anchor offsets at the start of the timeline", () => {
    expect(
      messageScrollDistanceFromBottom({
        contentSize: 400,
        offset: 20,
        viewportSize: 600,
      })
    ).toBe(0);
    expect(messageAnchorOffset(8)).toBe(0);
    expect(messageAnchorOffset(240)).toBe(224);
  });

  it("stores the nearest stable message and its relative reading offset", () => {
    const anchors = [
      { id: "first", position: 80 },
      { id: "second", position: 460 },
      { id: "third", position: 920 },
    ];

    expect(messageReadingPosition(610, anchors)).toEqual({
      anchorId: "second",
      offset: 166,
    });
    expect(messageReadingPosition(0, anchors)).toEqual({
      anchorId: "first",
      offset: 0,
    });
  });
});
