import type { Message, Part, SessionMessage } from "@opencode-ai/sdk/v2/types";
import type {
  TimelineFileChange,
  TimelineItem,
  TimelinePart,
} from "@vibepad/protocol/timeline";

type TimelineStatus = Extract<TimelinePart, { type: "tool" }>["status"];

interface ToolRecord {
  readonly additions?: unknown;
  readonly command?: unknown;
  readonly content?: unknown;
  readonly deletions?: unknown;
  readonly description?: unknown;
  readonly diff?: unknown;
  readonly existed?: unknown;
  readonly exists?: unknown;
  readonly exit?: unknown;
  readonly file?: unknown;
  readonly filediff?: unknown;
  readonly filePath?: unknown;
  readonly filepath?: unknown;
  readonly files?: unknown;
  readonly name?: unknown;
  readonly output?: unknown;
  readonly patch?: unknown;
  readonly patchText?: unknown;
  readonly path?: unknown;
  readonly pattern?: unknown;
  readonly query?: unknown;
  readonly relativePath?: unknown;
  readonly resource?: unknown;
  readonly status?: unknown;
  readonly subagent_type?: unknown;
  readonly target?: unknown;
  readonly type?: unknown;
  readonly url?: unknown;
  readonly [key: string]: unknown;
}

const isoTimestamp = (timestamp: number) => new Date(timestamp).toISOString();

const asRecord = (value: unknown): ToolRecord =>
  typeof value === "object" && value !== null ? (value as ToolRecord) : {};

const asString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const diffLineCounts = (patch: string | undefined) => {
  let additions = 0;
  let deletions = 0;
  for (const line of patch?.split("\n") ?? []) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions += 1;
    }
  }
  return { additions, deletions };
};

const contentLineCount = (content: string | undefined) => {
  if (!content) {
    return 0;
  }
  return content.endsWith("\n")
    ? content.split("\n").length - 1
    : content.split("\n").length;
};

const patchAction = (value: unknown): TimelineFileChange["action"] => {
  if (value === "add" || value === "added") {
    return "create";
  }
  if (value === "delete" || value === "deleted") {
    return "delete";
  }
  if (value === "move") {
    return "move";
  }
  return "edit";
};

const pendingPatchChanges = (
  patchText: string | undefined
): TimelineFileChange[] => {
  if (!patchText) {
    return [];
  }
  const changes: TimelineFileChange[] = [];
  const marker = /^\*\*\* (?<action>Add|Delete|Update) File: (?<path>.+)$/gmu;
  for (const match of patchText.matchAll(marker)) {
    const [, operation, path] = match;
    if (!(operation && path)) {
      continue;
    }
    let action: TimelineFileChange["action"] = "edit";
    if (operation === "Add") {
      action = "create";
    } else if (operation === "Delete") {
      action = "delete";
    }
    changes.push({
      action,
      additions: 0,
      deletions: 0,
      path,
    });
  }
  return changes;
};

const projectStructuredFiles = (
  value: unknown
): TimelineFileChange[] | undefined => {
  if (!Array.isArray(value)) {
    return;
  }
  return value.flatMap((entry) => {
    const file = asRecord(entry);
    const path =
      asString(file.relativePath) ??
      asString(file.filePath) ??
      asString(file.file);
    if (!path) {
      return [];
    }
    const patch = asString(file.patch);
    const counts = diffLineCounts(patch);
    return [
      {
        action: patchAction(file.type ?? file.status),
        additions: asNumber(file.additions) ?? counts.additions,
        deletions: asNumber(file.deletions) ?? counts.deletions,
        ...(patch ? { patch } : {}),
        path,
      },
    ];
  });
};

const projectEditChanges = (
  input: ToolRecord,
  metadata: ToolRecord
): TimelineFileChange[] => {
  const structured = projectStructuredFiles(metadata.files);
  if (structured) {
    return structured;
  }
  const fileDiff = asRecord(metadata.filediff);
  const patch = asString(fileDiff.patch) ?? asString(metadata.diff);
  const counts = diffLineCounts(patch);
  const path =
    asString(fileDiff.file) ??
    asString(input.filePath) ??
    asString(metadata.filepath);
  if (!path) {
    return [];
  }
  return [
    {
      action: "edit",
      additions: asNumber(fileDiff.additions) ?? counts.additions,
      deletions: asNumber(fileDiff.deletions) ?? counts.deletions,
      ...(patch ? { patch } : {}),
      path,
    },
  ];
};

const projectWriteChanges = (
  input: ToolRecord,
  metadata: ToolRecord
): TimelineFileChange[] => {
  const path =
    asString(input.filePath) ??
    asString(input.path) ??
    asString(metadata.filepath) ??
    asString(metadata.resource) ??
    asString(metadata.target);
  if (!path) {
    return [];
  }
  const content = asString(input.content);
  const creating = metadata.exists === false || metadata.existed === false;
  return [
    {
      action: creating ? "create" : "edit",
      additions: creating ? contentLineCount(content) : 0,
      ...(content ? { content } : {}),
      deletions: 0,
      path,
    },
  ];
};

const projectPatchChanges = (
  input: ToolRecord,
  metadata: ToolRecord
): TimelineFileChange[] =>
  projectStructuredFiles(metadata.files) ??
  pendingPatchChanges(asString(input.patchText));

const projectFileChanges = (
  name: string,
  input: ToolRecord,
  metadata: ToolRecord
): TimelineFileChange[] | undefined => {
  if (name === "edit") {
    return projectEditChanges(input, metadata);
  }

  if (name === "write") {
    return projectWriteChanges(input, metadata);
  }

  if (name !== "apply_patch") {
    return;
  }
  return projectPatchChanges(input, metadata);
};

const contextPresentation = (
  name: string,
  input: ToolRecord
): Pick<
  Extract<TimelinePart, { type: "tool" }>,
  "action" | "category" | "target"
> => {
  if (name === "read") {
    return {
      action: "read",
      category: "context",
      target: asString(input.filePath) ?? asString(input.path),
    };
  }
  if (name === "list") {
    return {
      action: "list",
      category: "context",
      target: asString(input.path),
    };
  }
  if (name === "glob" || name === "grep") {
    return {
      action: "search",
      category: "context",
      target:
        asString(input.pattern) ??
        asString(input.query) ??
        asString(input.path),
    };
  }
  if (name === "websearch" || name === "web_search" || name === "webfetch") {
    return {
      action: "web-search",
      category: "context",
      target: asString(input.query) ?? asString(input.url),
    };
  }
  if (name === "task") {
    return {
      action: "call",
      category: "agent",
      target: asString(input.description) ?? asString(input.subagent_type),
    };
  }
  return {
    action: "call",
    category: "generic",
    target: [
      input.description,
      input.query,
      input.url,
      input.filePath,
      input.path,
      input.pattern,
      input.name,
    ]
      .map(asString)
      .find(Boolean),
  };
};

const projectTool = ({
  error,
  id,
  input: rawInput,
  metadata: rawMetadata,
  name,
  output,
  status,
  title,
}: {
  readonly error?: string | undefined;
  readonly id: string;
  readonly input: unknown;
  readonly metadata?: unknown;
  readonly name: string;
  readonly output: unknown;
  readonly status: TimelineStatus;
  readonly title?: string | undefined;
}): TimelinePart => {
  const input = asRecord(rawInput);
  const metadata = asRecord(rawMetadata);

  if (name === "bash") {
    const command =
      asString(input.command) ?? asString(metadata.command) ?? title ?? "";
    const shellOutput = asString(output) ?? asString(metadata.output) ?? "";
    return {
      action: "run",
      command,
      ...(error ? { error } : {}),
      ...(asNumber(metadata.exit) === undefined
        ? {}
        : { exitCode: asNumber(metadata.exit) }),
      id,
      output: shellOutput,
      status,
      ...((asString(input.description) ?? title)
        ? { summary: asString(input.description) ?? title }
        : {}),
      type: "shell",
    };
  }

  const changes = projectFileChanges(name, input, metadata);
  if (changes) {
    return {
      changes,
      ...(error ? { error } : {}),
      id,
      status,
      type: "file-change",
    };
  }

  return {
    ...contextPresentation(name, input),
    ...(error ? { error } : {}),
    id,
    input: rawInput,
    metadata: rawMetadata,
    name,
    output,
    status,
    type: "tool",
  };
};

const mapAssistantPart = (
  part: Extract<SessionMessage, { type: "assistant" }>["content"][number]
): TimelinePart => {
  if (part.type === "text") {
    return {
      format: "markdown",
      id: part.id,
      text: part.text,
      type: "text",
    };
  }

  if (part.type === "reasoning") {
    return {
      id: part.id,
      text: part.text,
      type: "reasoning",
    };
  }

  const { state } = part;
  let output: unknown = null;
  if (state.status === "completed" || state.status === "error") {
    output = state.result ?? state.content;
  } else if (state.status === "running") {
    output = state.content;
  }

  return projectTool({
    ...(state.status === "error" ? { error: state.error.message } : {}),
    id: part.id,
    input: state.input,
    ...(state.status === "pending" ? {} : { metadata: state.structured }),
    name: part.name,
    output,
    status: state.status,
  });
};

const markTrailingFinalAnswer = (
  parts: readonly TimelinePart[],
  completed: boolean
): TimelinePart[] => {
  if (!completed) {
    return [...parts];
  }

  let finalTextStart = parts.length;
  while (finalTextStart > 0 && parts[finalTextStart - 1]?.type === "text") {
    finalTextStart -= 1;
  }
  if (finalTextStart === parts.length) {
    return [...parts];
  }

  return parts.map((part, index) =>
    index >= finalTextStart && part.type === "text"
      ? { ...part, phase: "final-answer" }
      : part
  );
};

export const mapTimelineMessage = (
  sessionId: string,
  message: SessionMessage
): TimelineItem => {
  const common = {
    createdAt: isoTimestamp(message.time.created),
    id: message.id,
    native: message,
    sessionId,
    visibility: "primary",
  } as const;

  if (message.type === "user") {
    return {
      ...common,
      kind: "message",
      parts: [
        {
          format: "markdown",
          id: `${message.id}:text`,
          text: message.text,
          type: "text",
        },
        ...(message.files ?? []).map((file, index) => ({
          id: `${message.id}:attachment:${index}`,
          mime: file.mime,
          ...(file.name ? { name: file.name } : {}),
          type: "attachment" as const,
          uri: file.uri,
        })),
      ],
      role: "user",
    };
  }

  if (message.type === "assistant") {
    return {
      ...common,
      ...(message.time.completed
        ? { completedAt: isoTimestamp(message.time.completed) }
        : {}),
      kind: "message",
      parts: markTrailingFinalAnswer(
        message.content.map(mapAssistantPart),
        message.time.completed !== undefined
      ),
      role: "assistant",
      turnId: message.id,
    };
  }

  if (message.type === "shell") {
    return {
      ...common,
      ...(message.time.completed
        ? { completedAt: isoTimestamp(message.time.completed) }
        : {}),
      kind: "shell",
      parts: [
        {
          action: "run",
          command: message.command,
          id: message.callID,
          output: message.output,
          status: message.time.completed ? "completed" : "running",
          type: "shell",
        },
      ],
    };
  }

  if (message.type === "compaction") {
    return {
      ...common,
      kind: "compaction",
      parts: [
        {
          format: "plain",
          id: `${message.id}:summary`,
          text: message.summary,
          type: "text",
        },
      ],
      role: "system",
    };
  }

  if (message.type === "agent-switched") {
    return {
      ...common,
      kind: "notice",
      parts: [
        {
          format: "plain",
          id: `${message.id}:agent`,
          text: `Agent switched to ${message.agent}`,
          type: "text",
        },
      ],
      role: "system",
    };
  }

  if (message.type === "model-switched") {
    return {
      ...common,
      kind: "notice",
      parts: [
        {
          format: "plain",
          id: `${message.id}:model`,
          text: `Model switched to ${message.model.providerID}/${message.model.id}`,
          type: "text",
        },
      ],
      role: "system",
    };
  }

  return {
    ...common,
    kind: "message",
    parts: [
      {
        format: "plain",
        id: `${message.id}:text`,
        text: message.text,
        type: "text",
      },
    ],
    role: "system",
    visibility: "provider-detail",
  };
};

export const mapLegacyPart = (part: Part): TimelinePart | undefined => {
  if (part.type === "text" && !part.ignored) {
    return {
      format: "markdown",
      id: part.id,
      text: part.text,
      type: "text",
    };
  }
  if (part.type === "reasoning") {
    return {
      id: part.id,
      text: part.text,
      type: "reasoning",
    };
  }
  if (part.type === "file") {
    return {
      id: part.id,
      mime: part.mime,
      ...(part.filename ? { name: part.filename } : {}),
      type: "attachment",
      uri: part.url,
    };
  }
  if (part.type !== "tool") {
    return;
  }

  const { state } = part;
  let output: unknown = null;
  if (state.status === "completed") {
    const { output: completedOutput } = state;
    output = completedOutput;
  } else if (state.status === "running") {
    output = state.title ?? null;
  }
  return projectTool({
    ...(state.status === "error" ? { error: state.error } : {}),
    id: part.id,
    input: state.input,
    ...(state.status === "completed" || state.status === "error"
      ? { metadata: state.metadata }
      : {}),
    name: part.tool,
    output,
    status: state.status,
    ...(state.status === "running" || state.status === "completed"
      ? { title: state.title }
      : {}),
  });
};

export const mapLegacyTimelineMessage = (
  sessionId: string,
  message: { readonly info: Message; readonly parts: readonly Part[] }
): TimelineItem | undefined => {
  const parts = message.parts.flatMap((part) => {
    const mapped = mapLegacyPart(part);
    return mapped ? [mapped] : [];
  });
  if (parts.length === 0) {
    return;
  }

  return {
    ...(message.info.role === "assistant" && message.info.time.completed
      ? { completedAt: isoTimestamp(message.info.time.completed) }
      : {}),
    createdAt: isoTimestamp(message.info.time.created),
    id: message.info.id,
    kind: "message",
    native: message,
    parts:
      message.info.role === "assistant"
        ? markTrailingFinalAnswer(
            parts,
            message.info.time.completed !== undefined
          )
        : parts,
    role: message.info.role,
    sessionId,
    ...(message.info.role === "assistant" ? { turnId: message.info.id } : {}),
    visibility: "primary",
  };
};
