export interface NormalizedPreviewPoint {
  readonly requestId: string;
  readonly x: number;
  readonly y: number;
}

export interface DomAnchor {
  readonly ariaLabel?: string;
  readonly component?: string;
  readonly rect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly role?: string;
  readonly selector: string;
  readonly source?: string;
  readonly tagName: string;
  readonly text?: string;
}

export interface DomSelectionResult {
  readonly anchor?: DomAnchor;
  readonly reason?: "cross-origin" | "empty" | "unavailable";
  readonly requestId: string;
}
