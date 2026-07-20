import type { TimelineItem, TimelinePage } from "@vibepad/protocol/timeline";
import { describe, expect, it } from "vitest";

import {
  latestFinalAnswerAnchor,
  projectTimeline,
} from "./timeline-projection";

const item = (
  id: string,
  parts: TimelineItem["parts"],
  options: Partial<TimelineItem> = {}
): TimelineItem => ({
  completedAt: "2026-07-19T19:00:03.000Z",
  createdAt: "2026-07-19T19:00:00.000Z",
  id,
  kind: "message",
  native: null,
  parts: [...parts],
  role: "assistant",
  sessionId: "session-1",
  turnId: "turn-1",
  visibility: "primary",
  ...options,
});

const page = (items: readonly TimelineItem[]): TimelinePage => ({
  items: [...items],
});

describe("provider-neutral timeline projection", () => {
  it("projects interleaved OpenCode prose and work into ordered neutral blocks", () => {
    const blocks = projectTimeline(
      page([
        item("opencode-message", [
          {
            format: "markdown",
            id: "commentary",
            text: "I will inspect the code.",
            type: "text",
          },
          {
            action: "read",
            category: "context",
            id: "read",
            input: { path: "src/app.ts" },
            name: "read",
            output: "contents",
            status: "completed",
            target: "src/app.ts",
            type: "tool",
          },
          {
            format: "markdown",
            id: "final",
            phase: "final-answer",
            text: "The code is correct.",
            type: "text",
          },
        ]),
      ])
    );

    expect(blocks.map(({ type }) => type)).toEqual([
      "message",
      "activity",
      "message",
    ]);
    expect(blocks[2]).toEqual(
      expect.objectContaining({ phase: "final-answer", type: "message" })
    );
  });

  it("groups contiguous activity across provider items by turn id", () => {
    const blocks = projectTimeline(
      page([
        item("shell-item", [
          {
            action: "run",
            command: "bun test",
            id: "shell",
            output: "passed",
            status: "completed",
            type: "shell",
          },
        ]),
        item("change-item", [
          {
            changes: [
              {
                action: "edit",
                additions: 1,
                deletions: 1,
                path: "src/app.ts",
              },
            ],
            id: "change",
            status: "completed",
            type: "file-change",
          },
        ]),
      ])
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual(
      expect.objectContaining({
        sourceItemIds: ["shell-item", "change-item"],
        type: "activity",
      })
    );
    expect(blocks[0]?.parts).toHaveLength(2);
  });

  it("anchors the latest final answer and falls back to visible assistant prose", () => {
    const explicit = projectTimeline(
      page([
        item("first", [
          {
            format: "markdown",
            id: "first-text",
            phase: "final-answer",
            text: "First final answer",
            type: "text",
          },
        ]),
        item("second", [
          {
            format: "markdown",
            id: "second-text",
            phase: "final-answer",
            text: "Latest final answer",
            type: "text",
          },
        ]),
      ])
    );
    expect(latestFinalAnswerAnchor(explicit)).toBe(
      "message:second:second-text"
    );

    const legacy = projectTimeline(
      page([
        item("legacy", [
          {
            format: "markdown",
            id: "legacy-text",
            text: "Legacy assistant answer",
            type: "text",
          },
        ]),
      ])
    );
    expect(latestFinalAnswerAnchor(legacy)).toBe("message:legacy:legacy-text");
  });
});
