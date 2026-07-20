import type { TimelinePart } from "@vibepad/protocol/timeline";

export type TimelineActivityPart = Extract<
  TimelinePart,
  { type: "file-change" | "reasoning" | "shell" | "tool" }
>;

export type TimelineContentPart = Extract<
  TimelinePart,
  { type: "attachment" | "text" }
>;

export const isTimelineActivityPart = (
  part: TimelinePart
): part is TimelineActivityPart =>
  part.type === "file-change" ||
  part.type === "reasoning" ||
  part.type === "shell" ||
  part.type === "tool";

export const isTimelineContentPart = (
  part: TimelinePart
): part is TimelineContentPart =>
  part.type === "attachment" || part.type === "text";
