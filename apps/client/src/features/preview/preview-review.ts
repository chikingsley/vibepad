import type { FeedbackPoint } from "@/features/preview/components/feedback-overlay";
import type {
  DomAnchor,
  DomSelectionResult,
} from "@/features/preview/components/preview-frame";

export interface PreviewCueTarget {
  readonly tabId: string;
  readonly url: string;
}

interface PreviewCueBase {
  readonly id: string;
  readonly offsetMs: number;
  readonly target: PreviewCueTarget;
}

export interface PreviewStrokeCue extends PreviewCueBase {
  readonly kind: "stroke";
  readonly points: readonly FeedbackPoint[];
}

export interface PreviewSelectionCue extends PreviewCueBase {
  readonly anchor?: DomAnchor;
  readonly kind: "selection";
  readonly point: FeedbackPoint;
  readonly reason?: DomSelectionResult["reason"];
}

export type PreviewFeedbackCue = PreviewSelectionCue | PreviewStrokeCue;

export interface PreviewReviewDraft {
  readonly cues: readonly PreviewFeedbackCue[];
  readonly pendingSelectionCount: number;
  readonly reviewing: boolean;
}

export const emptyPreviewReviewDraft: PreviewReviewDraft = {
  cues: [],
  pendingSelectionCount: 0,
  reviewing: false,
};

const rounded = (value: number) => Math.round(value * 10_000) / 10_000;

const compactPoints = (points: readonly FeedbackPoint[]) => {
  const step = Math.max(1, Math.ceil(points.length / 160));
  return points
    .filter(
      (_point, index) => index % step === 0 || index === points.length - 1
    )
    .map((point) => ({
      pointer: point.pointer,
      pressure: rounded(point.pressure),
      x: rounded(point.x),
      y: rounded(point.y),
    }));
};

export const formatReviewOffset = (offsetMs: number) => {
  const seconds = Math.max(0, Math.round(offsetMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

export const reviewCueLabel = (cue: PreviewFeedbackCue) =>
  `${formatReviewOffset(cue.offsetMs)} · ${cue.kind === "selection" ? "Select" : "Draw"}`;

export const selectionLabel = (selection: PreviewSelectionCue) => {
  if (!selection.anchor) {
    if (selection.reason === "cross-origin") {
      return "Coordinate · DOM hidden by cross-origin page";
    }
    if (selection.reason === "empty") {
      return "Coordinate · no element at this point";
    }
    return "Coordinate · DOM unavailable";
  }
  return (
    selection.anchor.component?.trim() ||
    selection.anchor.ariaLabel?.trim() ||
    selection.anchor.text?.trim() ||
    selection.anchor.selector
  );
};

export const reviewCueDetail = (cue: PreviewFeedbackCue) =>
  cue.kind === "selection"
    ? selectionLabel(cue)
    : `${cue.points.length} vector points`;

export const buildPreviewFeedbackPrompt = (
  url: string,
  note: string,
  cues: readonly PreviewFeedbackCue[]
) => {
  const bundle = {
    cues: cues.map((cue) =>
      cue.kind === "stroke"
        ? {
            id: cue.id,
            kind: cue.kind,
            offsetMs: cue.offsetMs,
            points: compactPoints(cue.points),
            target: cue.target,
          }
        : {
            ...(cue.anchor ? { anchor: cue.anchor } : {}),
            id: cue.id,
            kind: cue.kind,
            offsetMs: cue.offsetMs,
            point: compactPoints([cue.point])[0],
            ...(cue.reason ? { reason: cue.reason } : {}),
            target: cue.target,
          }
    ),
    note: note.trim(),
    url,
    version: 1,
  };

  return [
    `I reviewed the preview at ${url}.`,
    note.trim() ? `My note: ${note.trim()}` : "",
    "Use the timecoded VibePad feedback bundle below as grounded UI feedback.",
    "```json",
    JSON.stringify(bundle, null, 2),
    "```",
  ]
    .filter(Boolean)
    .join("\n\n");
};
