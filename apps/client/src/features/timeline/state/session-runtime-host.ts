import type { ProviderEvent } from "@vibepad/protocol/events";
import type { PendingInteraction } from "@vibepad/protocol/interactions";
import type { SessionBootstrap } from "@vibepad/protocol/provider";
import type { TimelinePage } from "@vibepad/protocol/timeline";

export interface SessionRuntimeHost {
  readonly bootstrapSession: (
    sessionId: string,
    signal?: AbortSignal
  ) => Promise<SessionBootstrap>;
  readonly listInteractions: (
    sessionId: string,
    signal?: AbortSignal
  ) => Promise<readonly PendingInteraction[]>;
  readonly loadTimeline: (
    sessionId: string,
    signal?: AbortSignal,
    before?: string
  ) => Promise<TimelinePage>;
  readonly subscribeSessionEvents: (
    sessionId: string,
    signal: AbortSignal,
    afterCursor?: string
  ) => AsyncIterable<ProviderEvent>;
}
