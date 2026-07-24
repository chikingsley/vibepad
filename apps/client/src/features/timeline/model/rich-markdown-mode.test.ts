import { describe, expect, it } from "vitest";

import {
  isStreamingMessageBlock,
  selectRichMarkdownMode,
} from "./rich-markdown-mode";

describe("rich markdown mode", () => {
  it("routes the streaming tail to the streaming renderer when available", () => {
    expect(
      selectRichMarkdownMode(
        { staticRenderer: true, streamingRenderer: true },
        true
      )
    ).toBe("rich-streaming");
  });

  it("keeps a streaming tail plain instead of feeding partial Markdown to the static renderer", () => {
    expect(
      selectRichMarkdownMode(
        { staticRenderer: true, streamingRenderer: false },
        true
      )
    ).toBe("plain");
  });

  it("renders completed blocks with the static renderer when available", () => {
    expect(
      selectRichMarkdownMode(
        { staticRenderer: true, streamingRenderer: true },
        false
      )
    ).toBe("rich-static");
    expect(
      selectRichMarkdownMode(
        { staticRenderer: true, streamingRenderer: false },
        false
      )
    ).toBe("rich-static");
  });

  it("falls back to plain text when no renderer is available", () => {
    expect(
      selectRichMarkdownMode(
        { staticRenderer: false, streamingRenderer: false },
        true
      )
    ).toBe("plain");
    expect(
      selectRichMarkdownMode(
        { staticRenderer: false, streamingRenderer: false },
        false
      )
    ).toBe("plain");
  });

  it("treats only assistant blocks without a completion timestamp as streaming", () => {
    expect(isStreamingMessageBlock({ role: "assistant" })).toBe(true);
    expect(
      isStreamingMessageBlock({
        completedAt: "2026-07-23T10:00:00Z",
        role: "assistant",
      })
    ).toBe(false);
    expect(isStreamingMessageBlock({ role: "user" })).toBe(false);
    expect(isStreamingMessageBlock({ role: "system" })).toBe(false);
  });
});
