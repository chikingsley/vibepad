import { expect, it as test } from "vitest";

import type { ThreadItem } from "../generated/v2/ThreadItem";
import type { Turn } from "../generated/v2/Turn";
import { mapCodexTimelineItem, mapCodexTurns } from "./timeline";

const turn = (items: ThreadItem[]): Turn => ({
  completedAt: 1_700_000_003,
  durationMs: 3000,
  error: null,
  id: "turn-1",
  items,
  itemsView: "full",
  startedAt: 1_700_000_000,
  status: "completed",
});

test("projects a real Codex fileChange into per-file actions and diff counts", () => {
  const item = {
    changes: [
      {
        diff: "one\ntwo\n",
        kind: { type: "add" },
        path: "src/new.ts",
      },
      {
        diff: "--- a/src/old.ts\n+++ b/src/current.ts\n@@ -1 +1 @@\n-old\n+new",
        kind: { move_path: "src/current.ts", type: "update" },
        path: "src/old.ts",
      },
      {
        diff: "one\ntwo\n",
        kind: { type: "delete" },
        path: "src/gone.ts",
      },
    ],
    id: "file-change-1",
    status: "completed",
    type: "fileChange",
  } satisfies ThreadItem;

  const projected = mapCodexTimelineItem("thread-1", turn([item]), item);

  expect(projected.id).toBe("file-change-1");
  expect(projected.turnId).toBe("turn-1");
  expect(projected.parts).toEqual([
    expect.objectContaining({
      changes: [
        expect.objectContaining({
          action: "create",
          additions: 2,
          content: "one\ntwo\n",
          deletions: 0,
          path: "src/new.ts",
        }),
        expect.objectContaining({
          action: "move",
          additions: 1,
          deletions: 1,
          path: "src/current.ts",
          previousPath: "src/old.ts",
        }),
        expect.objectContaining({
          action: "delete",
          additions: 0,
          content: "one\ntwo\n",
          deletions: 2,
          path: "src/gone.ts",
        }),
      ],
      status: "completed",
      type: "file-change",
    }),
  ]);
});

test("keeps native Codex item ids for consecutive web searches", () => {
  const first = {
    action: null,
    id: "search-1",
    query: "first query",
    type: "webSearch",
  } satisfies ThreadItem;
  const second = {
    action: null,
    id: "search-2",
    query: "second query",
    type: "webSearch",
  } satisfies ThreadItem;

  const projected = mapCodexTurns("thread-1", [turn([first, second])]);

  expect(projected.map(({ id }) => id)).toEqual(["search-1", "search-2"]);
  expect(projected.map(({ turnId }) => turnId)).toEqual(["turn-1", "turn-1"]);
});

test("preserves Codex commentary and final-answer message phases", () => {
  const commentary = {
    id: "message-commentary",
    memoryCitation: null,
    phase: "commentary",
    text: "I am checking the provider contract.",
    type: "agentMessage",
  } satisfies ThreadItem;
  const finalAnswer = {
    id: "message-final",
    memoryCitation: null,
    phase: "final_answer",
    text: "The provider contract is valid.",
    type: "agentMessage",
  } satisfies ThreadItem;

  const projected = mapCodexTurns("thread-1", [
    turn([commentary, finalAnswer]),
  ]);

  expect(projected.map(({ parts }) => parts[0])).toEqual([
    expect.objectContaining({ phase: "commentary", type: "text" }),
    expect.objectContaining({ phase: "final-answer", type: "text" }),
  ]);
});
