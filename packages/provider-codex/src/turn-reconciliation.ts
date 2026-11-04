import type { ThreadItem } from "../generated/v2/ThreadItem";
import type { Turn } from "../generated/v2/Turn";

const itemStatus = (item: ThreadItem) => {
  const record = item as unknown as Record<string, unknown>;
  const status = Reflect.get(record, "status");
  return typeof status === "string" ? status : undefined;
};

const mergeThreadItem = (base: ThreadItem, persisted: ThreadItem) => {
  const baseStatus = itemStatus(base);
  const persistedStatus = itemStatus(persisted);
  if (
    persistedStatus === "inProgress" &&
    baseStatus !== undefined &&
    baseStatus !== "inProgress"
  ) {
    return base;
  }
  return persisted;
};

const conversationItemKey = (item: ThreadItem) => {
  if (item.type === "userMessage") {
    return `user:${JSON.stringify(item.content)}`;
  }
  if (item.type === "agentMessage") {
    return `agent:${item.phase ?? ""}:${item.text}`;
  }
  if (item.type === "plan") {
    return `plan:${item.text}`;
  }
  if (item.type === "reasoning") {
    return `reasoning:${JSON.stringify([item.summary, item.content])}`;
  }
};

const durableItemKey = (item: ThreadItem) => {
  const conversation = conversationItemKey(item);
  if (conversation) {
    return conversation;
  }
  if (item.type === "commandExecution") {
    return `command:${item.cwd}:${item.command}`;
  }
  if (item.type === "fileChange") {
    return `files:${JSON.stringify(item.changes)}`;
  }
  if (item.type === "mcpToolCall") {
    return `mcp:${item.server}:${item.tool}:${JSON.stringify(item.arguments)}`;
  }
  if (item.type === "dynamicToolCall") {
    return `dynamic:${item.namespace ?? ""}:${item.tool}:${JSON.stringify(item.arguments)}`;
  }
  if (item.type === "collabAgentToolCall") {
    return `collab:${item.tool}:${item.senderThreadId}:${JSON.stringify(item.receiverThreadIds)}:${item.prompt ?? ""}`;
  }
  if (item.type === "webSearch") {
    return `web:${item.query}`;
  }
  if (item.type === "imageView") {
    return `image:${item.path}`;
  }
};

const connectionItemIdPattern = /^item-\d+$/u;

const removeConnectionDuplicates = (items: readonly ThreadItem[]) => {
  const durableKeys = new Set(
    items.flatMap((item) => {
      if (connectionItemIdPattern.test(item.id)) {
        return [];
      }
      const key = durableItemKey(item);
      return key ? [key] : [];
    })
  );
  return items.filter((item) => {
    if (!connectionItemIdPattern.test(item.id)) {
      return true;
    }
    const key = durableItemKey(item);
    return !(key && durableKeys.has(key));
  });
};

export const mergeCodexTurn = (base: Turn, persisted: Turn): Turn => {
  const persistedById = new Map(
    persisted.items.map((item) => [item.id, item] as const)
  );
  const baseIds = new Set(base.items.map((item) => item.id));
  const persistedIds = new Set(persisted.items.map((item) => item.id));
  const unmatchedBaseConversationItems = new Map<string, number>();
  for (const item of base.items) {
    if (persistedIds.has(item.id)) {
      continue;
    }
    const key = conversationItemKey(item);
    if (key) {
      unmatchedBaseConversationItems.set(
        key,
        (unmatchedBaseConversationItems.get(key) ?? 0) + 1
      );
    }
  }
  const persistedOnlyItems = persisted.items.filter((item) => {
    if (baseIds.has(item.id)) {
      return false;
    }
    const key = conversationItemKey(item);
    const matchingBaseCount = key
      ? (unmatchedBaseConversationItems.get(key) ?? 0)
      : 0;
    if (!(key && matchingBaseCount > 0)) {
      return true;
    }
    unmatchedBaseConversationItems.set(key, matchingBaseCount - 1);
    return false;
  });
  const items = removeConnectionDuplicates([
    ...base.items.map((item) => {
      const persistedItem = persistedById.get(item.id);
      return persistedItem ? mergeThreadItem(item, persistedItem) : item;
    }),
    ...persistedOnlyItems,
  ]);
  return {
    ...base,
    ...persisted,
    completedAt: persisted.completedAt ?? base.completedAt,
    durationMs: persisted.durationMs ?? base.durationMs,
    error: persisted.error ?? base.error,
    items,
    itemsView: "full",
    startedAt: persisted.startedAt ?? base.startedAt,
    status:
      persisted.status === "inProgress" && base.status !== "inProgress"
        ? base.status
        : persisted.status,
  };
};
