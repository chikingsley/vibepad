export interface MessageScrollMetrics {
  readonly contentSize: number;
  readonly offset: number;
  readonly viewportSize: number;
}

export interface MessageAnchorPosition {
  readonly id: string;
  readonly position: number;
}

export interface MessageReadingPosition {
  readonly anchorId: string;
  readonly offset: number;
}

export const messageScrollDistanceFromBottom = ({
  contentSize,
  offset,
  viewportSize,
}: MessageScrollMetrics) =>
  Math.max(0, contentSize - viewportSize - Math.max(0, offset));

export const isMessageScrollDetached = (
  metrics: MessageScrollMetrics,
  threshold = 96
) => messageScrollDistanceFromBottom(metrics) > threshold;

export const messageAnchorOffset = (anchorPosition: number, inset = 16) =>
  Math.max(0, anchorPosition - inset);

export const messageReadingPosition = (
  scrollOffset: number,
  anchors: readonly MessageAnchorPosition[],
  inset = 16
): MessageReadingPosition | undefined => {
  const ordered = [...anchors].sort(
    (left, right) => left.position - right.position
  );
  if (ordered.length === 0) {
    return;
  }
  const referenceOffset = Math.max(0, scrollOffset) + inset;
  const selected =
    ordered.findLast((anchor) => anchor.position <= referenceOffset) ??
    ordered[0];
  if (!selected) {
    return;
  }
  return {
    anchorId: selected.id,
    offset: Math.max(
      0,
      Math.max(0, scrollOffset) - messageAnchorOffset(selected.position, inset)
    ),
  };
};
