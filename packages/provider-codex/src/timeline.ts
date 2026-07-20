import type { TimelineItem, TimelinePart } from "@vibepad/protocol/timeline";

import type { ThreadItem } from "../generated/v2/ThreadItem";
import type { Turn } from "../generated/v2/Turn";
import { codexSessionId } from "./ids";

const isoSeconds = (seconds: number) => new Date(seconds * 1000).toISOString();

const toolStatus = (
  status: "completed" | "declined" | "failed" | "inProgress"
): Extract<TimelinePart, { type: "tool" }>["status"] => {
  if (status === "inProgress") {
    return "running";
  }
  if (status === "failed" || status === "declined") {
    return "error";
  }
  return "completed";
};

const commonItem = (threadId: string, turn: Turn, item: ThreadItem) => {
  const started = turn.startedAt ?? turn.completedAt ?? Date.now() / 1000;
  return {
    ...(turn.completedAt ? { completedAt: isoSeconds(turn.completedAt) } : {}),
    createdAt: isoSeconds(started),
    id: item.id,
    native: { item, turnId: turn.id },
    sessionId: codexSessionId(threadId),
    turnId: turn.id,
    visibility: "primary" as const,
  };
};

const diffLineCounts = (diff: string) => {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions += 1;
    }
  }
  return { additions, deletions };
};

const contentLineCount = (content: string) =>
  content.endsWith("\n")
    ? content.split("\n").length - 1
    : content.split("\n").length;

const projectFileChange = (
  change: Extract<ThreadItem, { type: "fileChange" }>["changes"][number]
): Extract<TimelinePart, { type: "file-change" }>["changes"][number] => {
  const movedTo = change.kind.type === "update" ? change.kind.move_path : null;
  let action: "create" | "delete" | "edit" | "move" = "edit";
  if (change.kind.type === "add") {
    action = "create";
  } else if (change.kind.type === "delete") {
    action = "delete";
  } else if (movedTo) {
    action = "move";
  }
  if (change.kind.type === "add") {
    return {
      action,
      additions: contentLineCount(change.diff),
      content: change.diff,
      deletions: 0,
      path: change.path,
    };
  }
  if (change.kind.type === "delete") {
    return {
      action,
      additions: 0,
      content: change.diff,
      deletions: contentLineCount(change.diff),
      path: change.path,
    };
  }
  return {
    action,
    ...diffLineCounts(change.diff),
    patch: change.diff,
    path: movedTo ?? change.path,
    ...(movedTo ? { previousPath: change.path } : {}),
  };
};

const commandPresentation = (
  item: Extract<ThreadItem, { type: "commandExecution" }>
) => {
  const [first] = item.commandActions;
  if (!first || first.type === "unknown") {
    return { action: "run" as const };
  }
  if (first.type === "read") {
    return {
      action: "read" as const,
      target: first.name || first.path,
    };
  }
  if (first.type === "listFiles") {
    return {
      action: "list" as const,
      ...(first.path ? { target: first.path } : {}),
    };
  }
  return {
    action: "search" as const,
    ...(first.query || first.path
      ? { target: first.query ?? first.path ?? undefined }
      : {}),
  };
};

const userParts = (
  item: Extract<ThreadItem, { type: "userMessage" }>
): TimelinePart[] =>
  item.content.map((content, index) => {
    const id = `${item.id}:${index}`;
    if (content.type === "text") {
      return {
        format: "markdown",
        id,
        text: content.text,
        type: "text",
      };
    }
    if (content.type === "image") {
      return {
        id,
        mime: "image/*",
        type: "attachment",
        uri: content.url,
      };
    }
    if (content.type === "localImage") {
      return {
        id,
        mime: "image/*",
        name: content.path.split("/").at(-1) ?? content.path,
        type: "attachment",
        uri: content.path,
      };
    }
    return {
      format: "plain",
      id,
      text: `${content.type === "skill" ? "Skill" : "Mention"}: ${content.name}`,
      type: "text",
    };
  });

const toolPart = (
  id: string,
  name: string,
  status: Extract<TimelinePart, { type: "tool" }>["status"],
  input: unknown,
  output: unknown,
  error?: string,
  presentation?: Pick<
    Extract<TimelinePart, { type: "tool" }>,
    "action" | "category" | "metadata" | "target"
  >
): TimelinePart => ({
  ...presentation,
  ...(error ? { error } : {}),
  id,
  input,
  name,
  output,
  status,
  type: "tool",
});

type CommonTimelineItem = ReturnType<typeof commonItem>;

const mapConversationItem = (
  common: CommonTimelineItem,
  item: ThreadItem
): TimelineItem | undefined => {
  if (item.type === "userMessage") {
    return {
      ...common,
      kind: "message",
      parts: userParts(item),
      role: "user",
    };
  }
  if (item.type === "agentMessage") {
    return {
      ...common,
      kind: "message",
      parts: [
        {
          format: "markdown",
          id: item.id,
          ...(item.phase
            ? {
                phase:
                  item.phase === "final_answer"
                    ? ("final-answer" as const)
                    : ("commentary" as const),
              }
            : {}),
          text: item.text,
          type: "text",
        },
      ],
      role: "assistant",
    };
  }
  if (item.type === "plan") {
    return {
      ...common,
      kind: "message",
      parts: [{ id: item.id, text: item.text, type: "reasoning" }],
      role: "assistant",
    };
  }
  if (item.type === "reasoning") {
    return {
      ...common,
      kind: "message",
      parts: [
        {
          id: item.id,
          text: [...item.summary, ...item.content].join("\n\n"),
          type: "reasoning",
        },
      ],
      role: "assistant",
    };
  }
};

const mapToolCallItem = (
  common: CommonTimelineItem,
  item: ThreadItem
): TimelineItem | undefined => {
  if (item.type === "mcpToolCall") {
    return {
      ...common,
      kind: "message",
      parts: [
        toolPart(
          item.id,
          `${item.server}/${item.tool}`,
          toolStatus(item.status),
          item.arguments,
          item.result,
          item.error ? JSON.stringify(item.error) : undefined,
          { action: "call", category: "mcp" }
        ),
      ],
      role: "assistant",
    };
  }
  if (item.type === "dynamicToolCall") {
    return {
      ...common,
      kind: "message",
      parts: [
        toolPart(
          item.id,
          item.namespace ? `${item.namespace}/${item.tool}` : item.tool,
          toolStatus(item.status),
          item.arguments,
          item.contentItems,
          undefined,
          { action: "call", category: "generic" }
        ),
      ],
      role: "assistant",
    };
  }
  if (item.type === "collabAgentToolCall") {
    return {
      ...common,
      kind: "message",
      parts: [
        toolPart(
          item.id,
          `agent/${item.tool}`,
          toolStatus(item.status),
          {
            model: item.model,
            prompt: item.prompt,
            reasoningEffort: item.reasoningEffort,
            receivers: item.receiverThreadIds,
          },
          item.agentsStates,
          undefined,
          {
            action: "call",
            category: "agent",
            ...(item.prompt ? { target: item.prompt } : {}),
          }
        ),
      ],
      role: "assistant",
    };
  }
};

const noticeLabel = (item: ThreadItem) => {
  if (item.type === "subAgentActivity") {
    return `Subagent ${item.kind}: ${item.agentThreadId}`;
  }
  if (item.type === "enteredReviewMode") {
    return `Entered review mode: ${item.review}`;
  }
  if (item.type === "exitedReviewMode") {
    return `Exited review mode: ${item.review}`;
  }
  if (item.type === "sleep") {
    return `Waited ${item.durationMs} ms`;
  }
  if (item.type === "hookPrompt") {
    return "Hook instructions applied";
  }
  return "Image generated";
};

export const mapCodexTimelineItem = (
  threadId: string,
  turn: Turn,
  item: ThreadItem
): TimelineItem => {
  const common = commonItem(threadId, turn, item);
  const conversation = mapConversationItem(common, item);
  if (conversation) {
    return conversation;
  }
  if (item.type === "commandExecution") {
    const status = toolStatus(item.status);
    return {
      ...common,
      kind: "shell",
      parts: [
        {
          ...commandPresentation(item),
          command: item.command,
          ...(item.durationMs === null ? {} : { durationMs: item.durationMs }),
          ...(status === "error" ? { error: `Command ${item.status}` } : {}),
          ...(item.exitCode === null ? {} : { exitCode: item.exitCode }),
          id: item.id,
          output: item.aggregatedOutput ?? "",
          status,
          type: "shell",
        },
      ],
    };
  }
  if (item.type === "fileChange") {
    return {
      ...common,
      kind: "message",
      parts: [
        {
          changes: item.changes.map(projectFileChange),
          id: item.id,
          status: toolStatus(item.status),
          type: "file-change",
        },
      ],
      role: "assistant",
    };
  }
  const toolCall = mapToolCallItem(common, item);
  if (toolCall) {
    return toolCall;
  }
  if (item.type === "contextCompaction") {
    return {
      ...common,
      kind: "compaction",
      parts: [
        {
          format: "plain",
          id: item.id,
          text: "Codex compacted this thread's context.",
          type: "text",
        },
      ],
      role: "system",
    };
  }

  if (item.type === "webSearch") {
    return {
      ...common,
      kind: "message",
      parts: [
        toolPart(
          item.id,
          "web_search",
          "completed",
          { query: item.query },
          item.action,
          undefined,
          {
            action: "web-search",
            category: "context",
            target: item.query,
          }
        ),
      ],
      role: "assistant",
    };
  }

  if (item.type === "imageView") {
    return {
      ...common,
      kind: "message",
      parts: [
        toolPart(
          item.id,
          "view_image",
          "completed",
          { path: item.path },
          null,
          undefined,
          {
            action: "read",
            category: "context",
            target: item.path,
          }
        ),
      ],
      role: "assistant",
    };
  }

  return {
    ...common,
    kind: "notice",
    parts: [
      {
        format: "plain",
        id: common.id,
        text: noticeLabel(item),
        type: "text",
      },
    ],
    role: "system",
    visibility: "provider-detail",
  };
};

export const mapCodexTurns = (
  threadId: string,
  turns: readonly Turn[]
): TimelineItem[] =>
  turns.flatMap((turn) =>
    turn.items.map((item) => mapCodexTimelineItem(threadId, turn, item))
  );
