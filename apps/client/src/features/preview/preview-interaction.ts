export type PreviewInteractionMode = "browse" | "draw" | "select";

export interface FeedbackPoint {
  readonly pointer: "mouse" | "pencil" | "touch" | "unknown";
  readonly pressure: number;
  readonly x: number;
  readonly y: number;
}

export interface FeedbackStroke {
  readonly id: string;
  readonly points: readonly FeedbackPoint[];
}

export interface FeedbackSelectionPoint {
  readonly id: string;
  readonly rect?: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly x: number;
  readonly y: number;
}
