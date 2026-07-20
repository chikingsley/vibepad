import type {
  TimelineItem,
  TimelineMessagePhase,
  TimelinePage,
} from "@vibepad/protocol/timeline";

import {
  isTimelineActivityPart,
  type TimelineActivityPart,
  type TimelineContentPart,
} from "./timeline-parts";

export type ProjectedMessagePhase = TimelineMessagePhase | "unknown";

export type ProjectedTimelineBlock =
  | {
      readonly completedAt?: string | undefined;
      readonly createdAt: string;
      readonly id: string;
      readonly itemKind: TimelineItem["kind"];
      readonly parts: readonly TimelineActivityPart[];
      readonly sourceItemIds: readonly string[];
      readonly turnId: string;
      readonly type: "activity";
    }
  | {
      readonly completedAt?: string | undefined;
      readonly createdAt: string;
      readonly id: string;
      readonly itemKind: TimelineItem["kind"];
      readonly parts: readonly TimelineContentPart[];
      readonly phase: ProjectedMessagePhase;
      readonly role: NonNullable<TimelineItem["role"]>;
      readonly sourceItemId: string;
      readonly turnId?: string | undefined;
      readonly type: "message";
    };

const blockId = (
  type: ProjectedTimelineBlock["type"],
  item: TimelineItem,
  firstPartId: string
) => `${type}:${item.id}:${firstPartId}`;

const messagePhase = (
  parts: readonly TimelineContentPart[]
): ProjectedMessagePhase => {
  const phases = parts.flatMap((part) =>
    part.type === "text" && part.phase ? [part.phase] : []
  );
  if (phases.includes("final-answer")) {
    return "final-answer";
  }
  return phases.includes("commentary") ? "commentary" : "unknown";
};

const earlierTimestamp = (first: string, second: string) =>
  Date.parse(first) <= Date.parse(second) ? first : second;

const laterTimestamp = (first: string, second: string) =>
  Date.parse(first) >= Date.parse(second) ? first : second;

const appendActivityBlock = (
  blocks: ProjectedTimelineBlock[],
  item: TimelineItem,
  parts: readonly TimelineActivityPart[]
) => {
  const [firstPart] = parts;
  if (!firstPart) {
    return;
  }
  const turnId = item.turnId ?? item.id;
  const previous = blocks.at(-1);
  if (previous?.type === "activity" && previous.turnId === turnId) {
    blocks[blocks.length - 1] = {
      ...previous,
      ...(previous.completedAt && item.completedAt
        ? {
            completedAt: laterTimestamp(previous.completedAt, item.completedAt),
          }
        : { completedAt: undefined }),
      createdAt: earlierTimestamp(previous.createdAt, item.createdAt),
      parts: [...previous.parts, ...parts],
      sourceItemIds: previous.sourceItemIds.includes(item.id)
        ? previous.sourceItemIds
        : [...previous.sourceItemIds, item.id],
    };
    return;
  }

  blocks.push({
    ...(item.completedAt ? { completedAt: item.completedAt } : {}),
    createdAt: item.createdAt,
    id: blockId("activity", item, firstPart.id),
    itemKind: item.kind,
    parts,
    sourceItemIds: [item.id],
    turnId,
    type: "activity",
  });
};

const appendMessageBlock = (
  blocks: ProjectedTimelineBlock[],
  item: TimelineItem,
  parts: readonly TimelineContentPart[]
) => {
  const [firstPart] = parts;
  if (!firstPart) {
    return;
  }
  blocks.push({
    ...(item.completedAt ? { completedAt: item.completedAt } : {}),
    createdAt: item.createdAt,
    id: blockId("message", item, firstPart.id),
    itemKind: item.kind,
    parts,
    phase: messagePhase(parts),
    role: item.role ?? "assistant",
    sourceItemId: item.id,
    ...(item.turnId ? { turnId: item.turnId } : {}),
    type: "message",
  });
};

const projectItem = (blocks: ProjectedTimelineBlock[], item: TimelineItem) => {
  let activityParts: TimelineActivityPart[] = [];
  let contentParts: TimelineContentPart[] = [];

  const flushActivity = () => {
    appendActivityBlock(blocks, item, activityParts);
    activityParts = [];
  };
  const flushContent = () => {
    appendMessageBlock(blocks, item, contentParts);
    contentParts = [];
  };

  for (const part of item.parts) {
    if (isTimelineActivityPart(part)) {
      flushContent();
      activityParts.push(part);
    } else {
      flushActivity();
      contentParts.push(part);
    }
  }
  flushActivity();
  flushContent();
};

export const projectTimeline = (
  page: TimelinePage
): readonly ProjectedTimelineBlock[] => {
  const blocks: ProjectedTimelineBlock[] = [];
  for (const item of page.items) {
    if (item.visibility === "primary") {
      projectItem(blocks, item);
    }
  }
  return blocks;
};

const hasVisibleText = (
  block: Extract<ProjectedTimelineBlock, { type: "message" }>
) =>
  block.parts.some(
    (part) => part.type === "text" && part.text.trim().length > 0
  );

export const latestFinalAnswerAnchor = (
  blocks: readonly ProjectedTimelineBlock[]
): string | undefined => {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (
      block?.type === "message" &&
      block.role === "assistant" &&
      block.phase === "final-answer" &&
      hasVisibleText(block)
    ) {
      return block.id;
    }
  }

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (
      block?.type === "message" &&
      block.role === "assistant" &&
      hasVisibleText(block)
    ) {
      return block.id;
    }
  }
};
