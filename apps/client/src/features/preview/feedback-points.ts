import type { FeedbackPoint } from "./preview-interaction";

export interface FeedbackPointInput {
  readonly pointer: FeedbackPoint["pointer"];
  readonly pressure: number | undefined;
  readonly x: number;
  readonly y: number;
}

export interface FeedbackViewport {
  readonly height: number;
  readonly width: number;
}

export const normalizeFeedbackPoint = (
  input: FeedbackPointInput,
  viewport: FeedbackViewport
): FeedbackPoint => {
  "worklet";
  return {
    pointer: input.pointer,
    pressure: input.pressure || 0.5,
    x: viewport.width ? input.x / viewport.width : 0,
    y: viewport.height ? input.y / viewport.height : 0,
  };
};

export const shouldAppendFeedbackPoint = (
  previous: FeedbackPoint | undefined,
  point: FeedbackPoint
) => {
  "worklet";
  return (
    !previous ||
    Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) >= 0.0015
  );
};
