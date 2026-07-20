import { batch, type Observable } from "@legendapp/state";
import type { SessionSummary } from "@vibepad/protocol/provider";

import { mergeLatestTimelinePage } from "../model/timeline-pages";
import type { SessionRuntimeHost } from "./session-runtime-host";
import type { SessionRuntimeRecord } from "./session-runtime-state";

export interface SessionActivation {
  readonly controller: AbortController;
  readonly start: () => void;
  readonly stop: () => void;
}

interface SessionActivationOptions {
  readonly host: SessionRuntimeHost;
  readonly isCurrent: () => boolean;
  readonly onSessionReady: (session: SessionSummary) => void;
  readonly preserveLoadedHistory: () => boolean;
  readonly refreshInteractions: (showLoading?: boolean) => Promise<void>;
  readonly session$: Observable<SessionRuntimeRecord>;
  readonly sessionId: string;
}

const changesInteractions = (kind: string) =>
  kind === "permission.requested" ||
  kind === "permission.resolved" ||
  kind === "question.requested" ||
  kind === "question.resolved";

const changesTimeline = (kind: string) =>
  kind === "timeline.item.removed" ||
  kind === "timeline.item.upserted" ||
  kind === "turn.completed" ||
  kind === "turn.started";

const runtimeErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown VibePad host error";

export function createSessionActivation({
  host,
  isCurrent,
  onSessionReady,
  preserveLoadedHistory,
  refreshInteractions,
  session$,
  sessionId,
}: SessionActivationOptions): SessionActivation {
  const controller = new AbortController();
  let afterCursor: string | undefined;
  let finishReconnectWait: (() => void) | undefined;
  let interactionTimer: ReturnType<typeof setInterval> | undefined;
  let loadInFlight: Promise<void> | undefined;
  let reconnectAttempt = 0;
  let refreshQueued = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  const loadInitial = async () => {
    batch(() => {
      session$.timelineError.set(undefined);
      session$.timelineStatus.set("loading");
    });
    try {
      const result = await host.bootstrapSession(sessionId, controller.signal);
      if (!isCurrent()) {
        return;
      }
      onSessionReady(result.session);
      batch(() => {
        session$.timeline.set(result.timeline);
        session$.timelineError.set(undefined);
        session$.timelineStatus.set("ready");
      });
    } catch (error) {
      if (isCurrent()) {
        batch(() => {
          session$.timelineError.set(runtimeErrorMessage(error));
          session$.timelineStatus.set("error");
        });
      }
    }
  };

  const repairLatest = async () => {
    try {
      const timeline = await host.loadTimeline(sessionId, controller.signal);
      if (!isCurrent()) {
        return;
      }
      const current = session$.timeline.peek();
      batch(() => {
        session$.timeline.set(
          current && preserveLoadedHistory()
            ? mergeLatestTimelinePage(current, timeline)
            : timeline
        );
        session$.timelineError.set(undefined);
        session$.timelineStatus.set("ready");
      });
    } catch {
      // The cached timeline remains usable while a repair request reconnects.
    }
  };

  const requestLoad = (initial: boolean): Promise<void> => {
    if (loadInFlight) {
      if (!initial) {
        refreshQueued = true;
      }
      return loadInFlight;
    }
    loadInFlight = (initial ? loadInitial() : repairLatest()).finally(() => {
      loadInFlight = undefined;
      if (refreshQueued && isCurrent()) {
        refreshQueued = false;
        requestLoad(false).catch(() => undefined);
      }
    });
    return loadInFlight;
  };

  const scheduleRefresh = () => {
    if (refreshTimer) {
      return;
    }
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      requestLoad(false).catch(() => undefined);
    }, 120);
  };

  const waitToReconnect = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(
        () => {
          finishReconnectWait = undefined;
          resolve();
        },
        Math.min(15_000, 750 * 2 ** reconnectAttempt)
      );
      finishReconnectWait = () => {
        clearTimeout(timer);
        finishReconnectWait = undefined;
        resolve();
      };
      reconnectAttempt += 1;
    });

  const consumeEvents = async () => {
    for await (const event of host.subscribeSessionEvents(
      sessionId,
      controller.signal,
      afterCursor
    )) {
      reconnectAttempt = 0;
      afterCursor = event.cursor;
      if (event.kind === "turn.started") {
        session$.running.set(true);
      } else if (event.kind === "turn.completed") {
        session$.running.set(false);
      }
      if (changesInteractions(event.kind)) {
        session$.interactionRevision.set(
          session$.interactionRevision.peek() + 1
        );
        refreshInteractions(false).catch(() => undefined);
      }
      if (changesTimeline(event.kind)) {
        scheduleRefresh();
      }
    }
  };

  const run = async () => {
    const hasCachedTimeline =
      session$.timelineStatus.peek() === "ready" &&
      session$.timeline.peek() !== undefined;
    await Promise.all([requestLoad(!hasCachedTimeline), refreshInteractions()]);
    if (!isCurrent()) {
      return;
    }
    interactionTimer = setInterval(() => {
      refreshInteractions(false).catch(() => undefined);
    }, 1500);
    while (isCurrent()) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: A live event stream is intentionally reconnected in order.
        await consumeEvents();
      } catch {
        if (!isCurrent()) {
          return;
        }
      }
      await waitToReconnect();
      if (isCurrent()) {
        await requestLoad(false);
      }
    }
  };

  const stop = () => {
    controller.abort();
    if (interactionTimer) {
      clearInterval(interactionTimer);
    }
    finishReconnectWait?.();
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
  };

  return {
    controller,
    start: () => {
      run().catch(() => undefined);
    },
    stop,
  };
}
