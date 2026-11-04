import type { SessionMessage } from "@opencode-ai/sdk/v2/types";
import { expect, it as test } from "vitest";

import { mapTimelineMessage } from "./timeline";

const assistantMessage = (
  content: Extract<SessionMessage, { type: "assistant" }>["content"]
): Extract<SessionMessage, { type: "assistant" }> => ({
  agent: "build",
  content,
  id: "message-1",
  model: { id: "test-model", providerID: "opencode" },
  time: { completed: 1_700_000_003, created: 1_700_000_000 },
  type: "assistant",
});

test("projects current OpenCode v2 edit metadata into a file change with stats", () => {
  const message = assistantMessage([
    {
      id: "edit-1",
      name: "edit",
      state: {
        content: [],
        input: { newString: "new", oldString: "old", path: "src/app.ts" },
        result: "Edit applied successfully.",
        status: "completed",
        structured: {
          files: [
            {
              additions: 1,
              deletions: 1,
              file: "src/app.ts",
              patch: "@@ -1 +1 @@\n-old\n+new",
              status: "modified",
            },
          ],
        },
      },
      time: { completed: 1_700_000_002, created: 1_700_000_001 },
      type: "tool",
    },
  ]);

  const projected = mapTimelineMessage("session-1", message);

  expect(projected.parts).toEqual([
    {
      changes: [
        {
          action: "edit",
          additions: 1,
          deletions: 1,
          patch: "@@ -1 +1 @@\n-old\n+new",
          path: "src/app.ts",
        },
      ],
      id: "edit-1",
      status: "completed",
      type: "file-change",
    },
  ]);
});

test("keeps compatibility with stored OpenCode filediff metadata", () => {
  const message = assistantMessage([
    {
      id: "edit-legacy-1",
      name: "edit",
      state: {
        content: [],
        input: { filePath: "/repo/src/legacy.ts" },
        result: "Edit applied successfully.",
        status: "completed",
        structured: {
          filediff: {
            additions: 2,
            deletions: 1,
            file: "src/legacy.ts",
            patch: "@@ -1 +1,2 @@\n-old\n+new\n+line",
          },
        },
      },
      time: { completed: 1_700_000_002, created: 1_700_000_001 },
      type: "tool",
    },
  ]);

  const [part] = mapTimelineMessage("session-1", message).parts;

  expect(part).toEqual(
    expect.objectContaining({
      changes: [
        expect.objectContaining({
          additions: 2,
          deletions: 1,
          path: "src/legacy.ts",
        }),
      ],
      type: "file-change",
    })
  );
});

test("projects current OpenCode write metadata as a created file", () => {
  const message = assistantMessage([
    {
      id: "write-1",
      name: "write",
      state: {
        content: [],
        input: { content: "alpha\nbeta\n", path: "notes.txt" },
        result: "Created file successfully: notes.txt",
        status: "completed",
        structured: {
          existed: false,
          operation: "write",
          resource: "notes.txt",
          target: "/repo/notes.txt",
        },
      },
      time: { completed: 1_700_000_002, created: 1_700_000_001 },
      type: "tool",
    },
  ]);

  expect(mapTimelineMessage("session-1", message).parts).toEqual([
    {
      changes: [
        {
          action: "create",
          additions: 2,
          content: "alpha\nbeta\n",
          deletions: 0,
          path: "notes.txt",
        },
      ],
      id: "write-1",
      status: "completed",
      type: "file-change",
    },
  ]);
});

test("projects OpenCode apply_patch metadata as one multi-file operation", () => {
  const message = assistantMessage([
    {
      id: "patch-1",
      name: "apply_patch",
      state: {
        content: [],
        input: { patchText: "*** Begin Patch" },
        result: "Done!",
        status: "completed",
        structured: {
          files: [
            {
              additions: 2,
              deletions: 0,
              patch: "@@ -0,0 +1,2 @@\n+one\n+two",
              relativePath: "src/new.ts",
              type: "add",
            },
            {
              additions: 1,
              deletions: 1,
              patch: "@@ -1 +1 @@\n-old\n+new",
              relativePath: "src/edit.ts",
              type: "update",
            },
          ],
        },
      },
      time: { completed: 1_700_000_002, created: 1_700_000_001 },
      type: "tool",
    },
  ]);

  const [part] = mapTimelineMessage("session-1", message).parts;

  expect(part).toEqual(
    expect.objectContaining({
      changes: [
        expect.objectContaining({
          action: "create",
          additions: 2,
          deletions: 0,
          path: "src/new.ts",
        }),
        expect.objectContaining({
          action: "edit",
          additions: 1,
          deletions: 1,
          path: "src/edit.ts",
        }),
      ],
      status: "completed",
      type: "file-change",
    })
  );
});

test("keeps shell output compact and structured instead of using a generic tool", () => {
  const message = assistantMessage([
    {
      id: "shell-1",
      name: "bash",
      state: {
        content: [],
        input: { command: "bun test", description: "Run tests" },
        result: "3 passed",
        status: "completed",
        structured: { command: "bun test", exit: 0, output: "3 passed" },
      },
      time: { completed: 1_700_000_002, created: 1_700_000_001 },
      type: "tool",
    },
  ]);

  expect(mapTimelineMessage("session-1", message).parts).toEqual([
    {
      action: "run",
      command: "bun test",
      exitCode: 0,
      id: "shell-1",
      output: "3 passed",
      status: "completed",
      summary: "Run tests",
      type: "shell",
    },
  ]);
});

test("marks only trailing completed OpenCode prose as the final answer", () => {
  const message = assistantMessage([
    {
      id: "commentary-1",
      text: "I will inspect the files first.",
      type: "text",
    },
    {
      id: "read-1",
      name: "read",
      state: {
        content: [],
        input: { path: "src/app.ts" },
        result: "file contents",
        status: "completed",
        structured: {},
      },
      time: { completed: 1_700_000_002, created: 1_700_000_001 },
      type: "tool",
    },
    {
      id: "final-1",
      text: "The implementation is correct.",
      type: "text",
    },
  ]);

  const projected = mapTimelineMessage("session-1", message);

  expect(projected.parts[0]).toEqual(
    expect.objectContaining({ id: "commentary-1", type: "text" })
  );
  expect(projected.parts[0]).not.toHaveProperty("phase");
  expect(projected.parts[2]).toEqual(
    expect.objectContaining({
      id: "final-1",
      phase: "final-answer",
      type: "text",
    })
  );
});

test("does not call streaming OpenCode prose a final answer", () => {
  const message = {
    ...assistantMessage([
      {
        id: "streaming-1",
        text: "Still working…",
        type: "text",
      },
    ]),
    time: { created: 1_700_000_000 },
  } satisfies Extract<SessionMessage, { type: "assistant" }>;

  const [part] = mapTimelineMessage("session-1", message).parts;

  expect(part).toEqual(
    expect.objectContaining({ id: "streaming-1", type: "text" })
  );
  expect(part).not.toHaveProperty("phase");
});
