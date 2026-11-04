import { expect, it as test } from "vitest";

import { mapClaudeTimeline } from "./timeline";

const sessionId = "claude-code:session:11111111-1111-4111-8111-111111111111";
const fallback = "2026-07-23T10:00:00.000Z";

const userText = (uuid: string, text: string) => ({
  message: { content: text, role: "user" },
  parent_tool_use_id: null,
  type: "user",
  uuid,
});

const assistantBlocks = (uuid: string, content: unknown[]) => ({
  message: { content, role: "assistant" },
  parent_tool_use_id: null,
  timestamp: "2026-07-23T10:00:05.000Z",
  type: "assistant",
  uuid,
});

const toolResultCarrier = (
  uuid: string,
  toolUseId: string,
  content: unknown,
  isError = false,
  structured?: unknown
) => ({
  message: {
    content: [
      {
        content,
        ...(isError ? { is_error: true } : {}),
        tool_use_id: toolUseId,
        type: "tool_result",
      },
    ],
    role: "user",
  },
  parent_tool_use_id: null,
  ...(structured === undefined ? {} : { tool_use_result: structured }),
  type: "user",
  uuid,
});

test("projects user text, assistant text, and reasoning with native payloads", () => {
  const user = userText("uuid-user", "Fix the failing test");
  const assistant = assistantBlocks("uuid-assistant", [
    { thinking: "The test asserts the wrong id.", type: "thinking" },
    { text: "I found the bug.", type: "text" },
  ]);

  const items = mapClaudeTimeline(sessionId, [user, assistant], fallback);

  expect(items).toHaveLength(2);
  expect(items[0]).toMatchObject({
    createdAt: fallback,
    id: "uuid-user",
    kind: "message",
    native: user,
    role: "user",
    sessionId,
  });
  expect(items[0]?.parts).toEqual([
    {
      format: "markdown",
      id: "uuid-user:0",
      text: "Fix the failing test",
      type: "text",
    },
  ]);
  expect(items[1]?.createdAt).toBe("2026-07-23T10:00:05.000Z");
  expect(items[1]?.native).toBe(assistant);
  expect(items[1]?.parts).toEqual([
    {
      id: "uuid-assistant:0",
      text: "The test asserts the wrong id.",
      type: "reasoning",
    },
    {
      format: "markdown",
      id: "uuid-assistant:1",
      text: "I found the bug.",
      type: "text",
    },
  ]);
});

test("pairs tool_use blocks with their tool_result and drops the carrier message", () => {
  const assistant = assistantBlocks("uuid-tool", [
    {
      id: "toolu_read",
      input: { file_path: "/repo/src/index.ts" },
      name: "Read",
      type: "tool_use",
    },
  ]);
  const carrier = toolResultCarrier(
    "uuid-carrier",
    "toolu_read",
    [{ text: "export const answer = 42;", type: "text" }],
    false,
    { file: { filePath: "/repo/src/index.ts" } }
  );

  const items = mapClaudeTimeline(sessionId, [assistant, carrier], fallback);

  expect(items).toHaveLength(1);
  expect(items[0]?.parts).toEqual([
    {
      action: "read",
      id: "toolu_read",
      input: { file_path: "/repo/src/index.ts" },
      metadata: { file: { filePath: "/repo/src/index.ts" } },
      name: "Read",
      output: [{ text: "export const answer = 42;", type: "text" }],
      status: "completed",
      target: "/repo/src/index.ts",
      type: "tool",
    },
  ]);
});

test("marks unpaired tool calls running and failed results as errors", () => {
  const running = assistantBlocks("uuid-running", [
    {
      id: "toolu_pending",
      input: { pattern: "TODO" },
      name: "Grep",
      type: "tool_use",
    },
  ]);
  const failing = assistantBlocks("uuid-failing", [
    {
      id: "toolu_failed",
      input: { file_path: "/missing" },
      name: "Read",
      type: "tool_use",
    },
  ]);
  const failure = toolResultCarrier(
    "uuid-failure",
    "toolu_failed",
    "File does not exist.",
    true
  );

  const items = mapClaudeTimeline(
    sessionId,
    [running, failing, failure],
    fallback
  );

  expect(items[0]?.parts[0]).toMatchObject({
    action: "search",
    status: "running",
    target: "TODO",
  });
  expect(items[1]?.parts[0]).toMatchObject({
    error: "File does not exist.",
    status: "error",
  });
});

test("projects Bash tool calls as shell items with command and output", () => {
  const bash = assistantBlocks("uuid-bash", [
    {
      id: "toolu_bash",
      input: { command: "bun test", description: "Run the test suite" },
      name: "Bash",
      type: "tool_use",
    },
  ]);
  const result = toolResultCarrier("uuid-bash-result", "toolu_bash", [
    { text: "12 pass, 0 fail", type: "text" },
  ]);

  const items = mapClaudeTimeline(sessionId, [bash, result], fallback);

  expect(items).toHaveLength(1);
  expect(items[0]?.kind).toBe("shell");
  expect(items[0]?.parts).toEqual([
    {
      command: "bun test",
      id: "toolu_bash",
      output: "12 pass, 0 fail",
      status: "completed",
      summary: "Run the test suite",
      type: "shell",
    },
  ]);
});

test("renames MCP tools to server/tool and tags them as mcp calls", () => {
  const mcp = assistantBlocks("uuid-mcp", [
    {
      id: "toolu_mcp",
      input: { city: "Berlin" },
      name: "mcp__weather__get_forecast",
      type: "tool_use",
    },
  ]);

  const items = mapClaudeTimeline(sessionId, [mcp], fallback);

  expect(items[0]?.parts[0]).toMatchObject({
    action: "call",
    category: "mcp",
    name: "weather/get_forecast",
    type: "tool",
  });
});

test("reads structured tool results from both key spellings", () => {
  const assistant = assistantBlocks("uuid-spellings", [
    {
      id: "toolu_spell",
      input: { file_path: "/x" },
      name: "Read",
      type: "tool_use",
    },
  ]);
  const transcriptCarrier = {
    message: {
      content: [
        { content: "data", tool_use_id: "toolu_spell", type: "tool_result" },
      ],
      role: "user",
    },
    parent_tool_use_id: null,
    toolUseResult: { file: { filePath: "/x" } },
    type: "user",
    uuid: "uuid-camel-carrier",
  };

  const items = mapClaudeTimeline(
    sessionId,
    [assistant, transcriptCarrier],
    fallback
  );

  expect(items).toHaveLength(1);
  expect(items[0]?.parts[0]).toMatchObject({
    metadata: { file: { filePath: "/x" } },
    status: "completed",
  });
});

test("projects a real recorded Claude Code transcript end to end", () => {
  // Shapes recorded verbatim from a live claude-haiku-4-5 run on 2026-07-23
  // (session 051039df, ~/.claude/projects/-tmp-vibepad-claude-live-rcfbLU),
  // with thinking signatures elided. Raw transcript files also contain
  // queue-operation/attachment/ai-title/last-prompt entries, which the
  // projection must ignore.
  const entries = [
    {
      content: "Use the Bash tool to run exactly `echo vibepad-live`",
      operation: "enqueue",
      sessionId: "051039df-3b9b-4421-8040-dd179e6dd1d0",
      timestamp: "2026-07-24T02:47:36.266Z",
      type: "queue-operation",
    },
    {
      message: {
        content:
          "Use the Bash tool to run exactly `echo vibepad-live`, nothing else. If the tool is denied, stop immediately.",
        role: "user",
      },
      parent_agent_id: null,
      parent_tool_use_id: null,
      session_id: "051039df-3b9b-4421-8040-dd179e6dd1d0",
      timestamp: "2026-07-24T02:47:36.278Z",
      type: "user",
      uuid: "05fd26cd-a5ed-4af7-9ee4-3ff7987e9d46",
    },
    {
      attachment: { type: "skill_listing" },
      parentUuid: "05fd26cd-a5ed-4af7-9ee4-3ff7987e9d46",
      type: "attachment",
      uuid: "e9eb7b84-58aa-4c0b-8bca-c348098619aa",
    },
    { type: "ai-title" },
    {
      message: {
        content: [
          {
            signature: "EuMDCpMBCBAYAipAWFbw-elided",
            thinking:
              "The user is asking me to run a very specific command using the Bash tool.",
            type: "thinking",
          },
        ],
        role: "assistant",
      },
      parent_agent_id: null,
      parent_tool_use_id: null,
      session_id: "051039df-3b9b-4421-8040-dd179e6dd1d0",
      timestamp: "2026-07-24T02:47:38.232Z",
      type: "assistant",
      uuid: "b2d651cc-ac39-40a9-b0a4-f29c86b5cc53",
    },
    {
      message: {
        content: [
          {
            caller: { type: "direct" },
            id: "toolu_01767Pnp6bZZW27xTXCfdxfE",
            input: {
              command: "echo vibepad-live",
              description: "Run the requested command",
            },
            name: "Bash",
            type: "tool_use",
          },
        ],
        role: "assistant",
      },
      parent_agent_id: null,
      parent_tool_use_id: null,
      session_id: "051039df-3b9b-4421-8040-dd179e6dd1d0",
      timestamp: "2026-07-24T02:47:38.653Z",
      type: "assistant",
      uuid: "cef4b34a-910b-4c07-a157-89198f8e0ff8",
    },
    {
      message: {
        content: [
          {
            content: "vibepad-live",
            is_error: false,
            tool_use_id: "toolu_01767Pnp6bZZW27xTXCfdxfE",
            type: "tool_result",
          },
        ],
        role: "user",
      },
      parent_agent_id: null,
      parent_tool_use_id: null,
      session_id: "051039df-3b9b-4421-8040-dd179e6dd1d0",
      timestamp: "2026-07-24T02:47:38.914Z",
      // Raw transcript entries persist the structured result camelCased.
      toolUseResult: {
        interrupted: false,
        isImage: false,
        stderr: "",
        stdout: "vibepad-live",
      },
      type: "user",
      uuid: "227ae9f9-9b46-4ca0-a0e8-2bcd82d56212",
    },
    {
      message: {
        content: [
          {
            text: "Done. The command executed successfully and returned `vibepad-live`.",
            type: "text",
          },
        ],
        role: "assistant",
      },
      parent_agent_id: null,
      parent_tool_use_id: null,
      session_id: "051039df-3b9b-4421-8040-dd179e6dd1d0",
      timestamp: "2026-07-24T02:47:40.534Z",
      type: "assistant",
      uuid: "84858f10-8686-4eb4-a057-d2afc9125da1",
    },
    { type: "last-prompt" },
  ];

  const items = mapClaudeTimeline(sessionId, entries, fallback);

  expect(items.map(({ id }) => id)).toEqual([
    "05fd26cd-a5ed-4af7-9ee4-3ff7987e9d46",
    "b2d651cc-ac39-40a9-b0a4-f29c86b5cc53",
    "cef4b34a-910b-4c07-a157-89198f8e0ff8",
    "84858f10-8686-4eb4-a057-d2afc9125da1",
  ]);
  expect(items[0]).toMatchObject({
    createdAt: "2026-07-24T02:47:36.278Z",
    role: "user",
  });
  expect(items[1]?.parts[0]).toMatchObject({ type: "reasoning" });
  expect(items[2]?.kind).toBe("shell");
  expect(items[2]?.parts[0]).toMatchObject({
    command: "echo vibepad-live",
    output: "vibepad-live",
    status: "completed",
    summary: "Run the requested command",
    type: "shell",
  });
  expect(items[3]?.parts[0]).toMatchObject({ type: "text" });
});

test("projects compact boundaries, attachments, and skips subagent traffic", () => {
  const compaction = {
    compact_metadata: { trigger: "auto" },
    parent_tool_use_id: null,
    subtype: "compact_boundary",
    type: "system",
    uuid: "uuid-compact",
  };
  const image = {
    message: {
      content: [
        {
          source: { data: "aGk=", media_type: "image/png", type: "base64" },
          type: "image",
        },
      ],
      role: "user",
    },
    parent_tool_use_id: null,
    type: "user",
    uuid: "uuid-image",
  };
  const subagent = {
    message: { content: "internal", role: "assistant" },
    parent_tool_use_id: "toolu_task",
    type: "assistant",
    uuid: "uuid-subagent",
  };
  const result = {
    result: "done",
    subtype: "success",
    type: "result",
    uuid: "uuid-result",
  };

  const items = mapClaudeTimeline(
    sessionId,
    [compaction, image, subagent, result],
    fallback
  );

  expect(items.map((item) => item.id)).toEqual(["uuid-compact", "uuid-image"]);
  expect(items[0]).toMatchObject({ kind: "compaction", role: "system" });
  expect(items[1]?.parts[0]).toEqual({
    id: "uuid-image:0",
    mime: "image/png",
    type: "attachment",
    uri: "data:image/png;base64,aGk=",
  });
});
