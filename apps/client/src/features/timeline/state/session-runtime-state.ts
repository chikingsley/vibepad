import type { PendingInteraction } from "@vibepad/protocol/interactions";
import type { TimelinePage } from "@vibepad/protocol/timeline";

export type RuntimeLoadStatus = "error" | "idle" | "loading" | "ready";

export interface SessionRuntimeRecord {
  interactionRevision: number;
  interactions: readonly PendingInteraction[];
  interactionsError: string | undefined;
  interactionsStatus: RuntimeLoadStatus;
  loadingOlder: boolean;
  olderLoadError: string | undefined;
  running: boolean;
  timeline: TimelinePage | undefined;
  timelineError: string | undefined;
  timelineStatus: RuntimeLoadStatus;
}

export interface SessionRuntimeState {
  bySessionId: Record<string, SessionRuntimeRecord>;
}

export const createIdleSessionRuntime = (): SessionRuntimeRecord => ({
  interactionRevision: 0,
  interactions: [],
  interactionsError: undefined,
  interactionsStatus: "idle",
  loadingOlder: false,
  olderLoadError: undefined,
  running: false,
  timeline: undefined,
  timelineError: undefined,
  timelineStatus: "idle",
});

export const idleSessionRuntime = createIdleSessionRuntime();
