import type { TimelineItem, TimelinePage } from "@vibepad/protocol/timeline";
import { describe, expect, it } from "vitest";

import {
  mergeLatestTimelinePage,
  prependOlderTimelinePage,
} from "./timeline-pages";

const item = (id: string, text = id): TimelineItem => ({
  createdAt: "2026-07-20T05:00:00.000Z",
  id,
  kind: "message",
  native: null,
  parts: [{ format: "plain", id: `${id}:text`, text, type: "text" }],
  role: "assistant",
  sessionId: "codex:test",
  visibility: "primary",
});

const page = (ids: readonly string[], olderCursor?: string): TimelinePage => ({
  items: ids.map((id) => item(id)),
  ...(olderCursor ? { olderCursor } : {}),
});

describe("timeline page merging", () => {
  it("prepends an older page without duplicating its overlap", () => {
    const merged = prependOlderTimelinePage(
      page(["new-1", "new-2"], "cursor-1"),
      page(["old-1", "new-1"], "cursor-2")
    );

    expect(merged.items.map(({ id }) => id)).toEqual([
      "old-1",
      "new-1",
      "new-2",
    ]);
    expect(merged.olderCursor).toBe("cursor-2");
  });

  it("refreshes recent items while preserving loaded history and its cursor", () => {
    const current = page(["old-1", "new-1"], "cursor-2");
    const latest: TimelinePage = {
      items: [item("new-1", "updated"), item("new-2")],
      olderCursor: "cursor-latest",
    };
    const merged = mergeLatestTimelinePage(current, latest);

    expect(merged.items.map(({ id }) => id)).toEqual([
      "old-1",
      "new-1",
      "new-2",
    ]);
    expect(merged.items[1]?.parts[0]).toEqual(
      expect.objectContaining({ text: "updated" })
    );
    expect(merged.olderCursor).toBe("cursor-2");
  });
});
