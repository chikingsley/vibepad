import type { TimelineItem, TimelinePart } from "@vibepad/protocol/timeline";

/**
 * Projects Claude Code conversation entries into VibePad timeline items.
 * Accepts both live Agent SDK stream messages and persisted transcript
 * messages (`getSessionMessages`), which share the same structural core:
 * `{ type, message, parent_tool_use_id, uuid }`.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const property = (record: Record<string, unknown>, key: string): unknown =>
  Reflect.get(record, key);

const stringProperty = (record: Record<string, unknown>, key: string) => {
  const value = property(record, key);
  return typeof value === "string" ? value : undefined;
};

interface PairedToolResult {
  readonly content: unknown;
  readonly isError: boolean;
  readonly structured?: unknown;
}

const flattenResultText = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .flatMap((block) => {
      if (!isRecord(block)) {
        return [];
      }
      const text = stringProperty(block, "text");
      return typeof text === "string" ? [text] : [];
    })
    .join("\n");
};

const messageContent = (entry: Record<string, unknown>): unknown => {
  const message = property(entry, "message");
  return isRecord(message) ? property(message, "content") : undefined;
};

const collectToolResults = (
  entries: readonly Record<string, unknown>[]
): ReadonlyMap<string, PairedToolResult> => {
  const results = new Map<string, PairedToolResult>();
  for (const entry of entries) {
    if (stringProperty(entry, "type") !== "user") {
      continue;
    }
    const content = messageContent(entry);
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (!isRecord(block) || property(block, "type") !== "tool_result") {
        continue;
      }
      const toolUseId = stringProperty(block, "tool_use_id");
      if (!toolUseId) {
        continue;
      }
      // Live SDK stream messages use `tool_use_result`; raw transcript
      // entries persist the same payload as `toolUseResult`.
      const structured =
        property(entry, "tool_use_result") ?? property(entry, "toolUseResult");
      results.set(toolUseId, {
        content: property(block, "content"),
        isError: property(block, "is_error") === true,
        ...(structured === undefined ? {} : { structured }),
      });
    }
  }
  return results;
};

const mcpToolName = /^mcp__(?<server>[^_]+(?:_[^_]+)*?)__(?<tool>.+)$/u;

type ToolPresentation = Pick<
  Extract<TimelinePart, { type: "tool" }>,
  "action" | "category" | "name" | "target"
>;

const toolActions: Readonly<
  Record<
    string,
    {
      readonly action: NonNullable<ToolPresentation["action"]>;
      readonly category?: NonNullable<ToolPresentation["category"]>;
      readonly targetKeys: readonly string[];
    }
  >
> = {
  Glob: { action: "search", targetKeys: ["pattern"] },
  Grep: { action: "search", targetKeys: ["pattern"] },
  NotebookRead: { action: "read", targetKeys: ["notebook_path"] },
  Read: { action: "read", targetKeys: ["file_path"] },
  Task: { action: "call", category: "agent", targetKeys: ["description"] },
  WebFetch: { action: "call", targetKeys: ["url"] },
  WebSearch: {
    action: "web-search",
    category: "context",
    targetKeys: ["query"],
  },
};

const firstStringProperty = (
  input: Record<string, unknown>,
  keys: readonly string[]
) => {
  for (const key of keys) {
    const value = stringProperty(input, key);
    if (value) {
      return value;
    }
  }
};

const toolPresentation = (
  name: string,
  input: Record<string, unknown>
): ToolPresentation => {
  const mcpMatch = mcpToolName.exec(name);
  if (mcpMatch?.[1] && mcpMatch[2]) {
    return {
      action: "call",
      category: "mcp",
      name: `${mcpMatch[1]}/${mcpMatch[2]}`,
    };
  }
  const known = toolActions[name];
  const target = firstStringProperty(
    input,
    known?.targetKeys ?? ["file_path", "path"]
  );
  return {
    action: known?.action ?? "call",
    ...(known?.category ? { category: known.category } : {}),
    name,
    ...(target ? { target } : {}),
  };
};

const toolUsePart = (
  block: Record<string, unknown>,
  results: ReadonlyMap<string, PairedToolResult>
): TimelinePart => {
  const id = stringProperty(block, "id") ?? "tool-use";
  const name = stringProperty(block, "name") ?? "tool";
  const input = property(block, "input");
  const inputRecord = isRecord(input) ? input : {};
  const result = results.get(id);
  if (name === "Bash") {
    return {
      command: stringProperty(inputRecord, "command") ?? "",
      ...(result?.isError
        ? { error: flattenResultText(result.content) || "Command failed" }
        : {}),
      id,
      output: result ? flattenResultText(result.content) : "",
      status: resultStatus(result),
      ...(stringProperty(inputRecord, "description")
        ? { summary: stringProperty(inputRecord, "description") }
        : {}),
      type: "shell",
    };
  }
  return {
    ...toolPresentation(name, inputRecord),
    ...(result?.isError
      ? { error: flattenResultText(result.content) || "Tool call failed" }
      : {}),
    id,
    input,
    ...(result?.structured === undefined
      ? {}
      : { metadata: result.structured }),
    output: result?.content ?? null,
    status: resultStatus(result),
    type: "tool",
  };
};

const resultStatus = (
  result: PairedToolResult | undefined
): "completed" | "error" | "running" => {
  if (!result) {
    return "running";
  }
  return result.isError ? "error" : "completed";
};

const attachmentPart = (
  id: string,
  block: Record<string, unknown>
): TimelinePart | undefined => {
  const source = property(block, "source");
  if (!isRecord(source)) {
    return;
  }
  const mediaType = stringProperty(source, "media_type") ?? "image/*";
  const url = stringProperty(source, "url");
  const data = stringProperty(source, "data");
  const uri = url ?? (data ? `data:${mediaType};base64,${data}` : undefined);
  if (!uri) {
    return;
  }
  return { id, mime: mediaType, type: "attachment", uri };
};

const userParts = (entryId: string, content: unknown): TimelinePart[] => {
  if (typeof content === "string") {
    return [
      { format: "markdown", id: `${entryId}:0`, text: content, type: "text" },
    ];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((block, index): TimelinePart[] => {
    if (!isRecord(block)) {
      return [];
    }
    const type = property(block, "type");
    const id = `${entryId}:${index}`;
    if (type === "text") {
      return [
        {
          format: "markdown",
          id,
          text: stringProperty(block, "text") ?? "",
          type: "text",
        },
      ];
    }
    if (type === "image") {
      const part = attachmentPart(id, block);
      return part ? [part] : [];
    }
    return [];
  });
};

const assistantParts = (
  entryId: string,
  content: unknown,
  results: ReadonlyMap<string, PairedToolResult>
): TimelinePart[] => {
  if (typeof content === "string") {
    return [
      { format: "markdown", id: `${entryId}:0`, text: content, type: "text" },
    ];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((block, index): TimelinePart[] => {
    if (!isRecord(block)) {
      return [];
    }
    const type = property(block, "type");
    const id = `${entryId}:${index}`;
    if (type === "text") {
      return [
        {
          format: "markdown",
          id,
          text: stringProperty(block, "text") ?? "",
          type: "text",
        },
      ];
    }
    if (type === "thinking") {
      return [
        {
          id,
          text: stringProperty(block, "thinking") ?? "",
          type: "reasoning",
        },
      ];
    }
    if (type === "redacted_thinking") {
      return [{ id, text: "[Redacted thinking]", type: "reasoning" }];
    }
    if (type === "tool_use") {
      return [toolUsePart(block, results)];
    }
    return [];
  });
};

const entryTimestamp = (
  entry: Record<string, unknown>,
  fallbackTimestamp: string
) => stringProperty(entry, "timestamp") ?? fallbackTimestamp;

const itemKind = (parts: readonly TimelinePart[]): "message" | "shell" =>
  parts.length > 0 && parts.every((part) => part.type === "shell")
    ? "shell"
    : "message";

const mapEntry = (
  sessionId: string,
  entry: Record<string, unknown>,
  entryId: string,
  results: ReadonlyMap<string, PairedToolResult>,
  fallbackTimestamp: string
): TimelineItem | undefined => {
  const type = stringProperty(entry, "type");
  const common = {
    createdAt: entryTimestamp(entry, fallbackTimestamp),
    id: entryId,
    native: entry,
    sessionId,
    visibility: "primary" as const,
  };
  if (type === "user") {
    const parts = userParts(entryId, messageContent(entry));
    if (parts.length === 0) {
      return;
    }
    return { ...common, kind: "message", parts, role: "user" };
  }
  if (type === "assistant") {
    const parts = assistantParts(entryId, messageContent(entry), results);
    if (parts.length === 0) {
      return;
    }
    return { ...common, kind: itemKind(parts), parts, role: "assistant" };
  }
  if (
    type === "system" &&
    stringProperty(entry, "subtype") === "compact_boundary"
  ) {
    return {
      ...common,
      kind: "compaction",
      parts: [
        {
          format: "plain",
          id: `${entryId}:0`,
          text: "Claude Code compacted this session's context.",
          type: "text",
        },
      ],
      role: "system",
    };
  }
};

/**
 * Maps one live SDK stream message to a timeline item, or undefined when the
 * message carries no timeline content (results, status, tool-result-only
 * user messages whose payloads are merged into their tool parts).
 */
export const mapClaudeTimelineEntry = (
  sessionId: string,
  entry: unknown,
  results: ReadonlyMap<string, PairedToolResult> = new Map(),
  fallbackTimestamp = new Date().toISOString()
): TimelineItem | undefined => {
  if (!isRecord(entry)) {
    return;
  }
  if (typeof property(entry, "parent_tool_use_id") === "string") {
    return;
  }
  const entryId = stringProperty(entry, "uuid");
  if (!entryId) {
    return;
  }
  return mapEntry(sessionId, entry, entryId, results, fallbackTimestamp);
};

/**
 * Projects a full transcript. Tool results reported by follow-up user
 * messages are merged into the originating tool call's part, so a completed
 * tool call renders as one unit with its input, output, and status.
 */
export const mapClaudeTimeline = (
  sessionId: string,
  entries: readonly unknown[],
  fallbackTimestamp = new Date().toISOString()
): TimelineItem[] => {
  const records = entries.filter(isRecord);
  const mainThread = records.filter(
    (entry) => typeof property(entry, "parent_tool_use_id") !== "string"
  );
  const results = collectToolResults(mainThread);
  return mainThread.flatMap((entry, index) => {
    const entryId = stringProperty(entry, "uuid") ?? `${sessionId}:${index}`;
    const item = mapEntry(
      sessionId,
      entry,
      entryId,
      results,
      fallbackTimestamp
    );
    return item ? [item] : [];
  });
};

export type { PairedToolResult };
export { collectToolResults };
