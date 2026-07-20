import type { ProviderCatalog } from "@vibepad/protocol/catalog";
import type { PendingInteraction } from "@vibepad/protocol/interactions";
import type {
  ServiceSummary,
  SessionSummary,
} from "@vibepad/protocol/provider";
import type { TimelinePage } from "@vibepad/protocol/timeline";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  mergeLatestTimelinePage,
  prependOlderTimelinePage,
} from "@/features/timeline/model/timeline-pages";
import type { VibePadHostClient } from "@/lib/vibepad-host";
import {
  useVibePadHost,
  useVibePadWorkspaceStore,
} from "@/lib/vibepad-host-context";

type ServicesState =
  | { readonly data: readonly ServiceSummary[]; readonly status: "idle" }
  | { readonly data: readonly ServiceSummary[]; readonly status: "loading" }
  | {
      readonly data: readonly ServiceSummary[];
      readonly message: string;
      readonly status: "error";
    }
  | { readonly data: readonly ServiceSummary[]; readonly status: "ready" };

type TimelineState =
  | { readonly status: "idle" }
  | { readonly sessionId: string; readonly status: "loading" }
  | {
      readonly message: string;
      readonly sessionId: string;
      readonly status: "error";
    }
  | {
      readonly data: TimelinePage;
      readonly sessionId: string;
      readonly status: "ready";
    };

type InteractionsState =
  | { readonly data: readonly PendingInteraction[]; readonly status: "idle" }
  | { readonly data: readonly PendingInteraction[]; readonly status: "loading" }
  | {
      readonly data: readonly PendingInteraction[];
      readonly message: string;
      readonly status: "error";
    }
  | { readonly data: readonly PendingInteraction[]; readonly status: "ready" };

type CatalogState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly message: string; readonly status: "error" }
  | { readonly data: ProviderCatalog; readonly status: "ready" };

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown VibePad host error";

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

const loadTimelinePage = async (
  host: VibePadHostClient,
  sessionId: string,
  signal: AbortSignal,
  initial: boolean
) => {
  if (initial) {
    const bootstrap = await host.bootstrapSession(sessionId, signal);
    return {
      data: bootstrap.timeline,
      kind: "bootstrap" as const,
      session: bootstrap.session as SessionSummary,
    };
  }
  return {
    data: await host.loadTimeline(sessionId, signal),
    kind: "timeline" as const,
  };
};

const loadedTimelineState = (
  current: TimelineState,
  data: TimelinePage,
  sessionId: string,
  preserveOlder: boolean
): TimelineState => {
  if (
    preserveOlder &&
    current.status === "ready" &&
    current.sessionId === sessionId
  ) {
    return {
      data: mergeLatestTimelinePage(current.data, data),
      sessionId,
      status: "ready",
    };
  }
  return { data, sessionId, status: "ready" };
};

export function useWorkspaceLifecycle() {
  const store = useVibePadWorkspaceStore();

  useEffect(() => {
    store.refresh().catch(() => undefined);
    return store.cancelPending;
  }, [store]);

  return {
    refresh: store.refresh,
    removeSession: store.removeSession,
    upsertSession: store.upsertSession,
  };
}

export function useProjectServices(projectId: string | undefined) {
  const host = useVibePadHost();
  const [state, setState] = useState<ServicesState>({
    data: [],
    status: "idle",
  });

  useEffect(() => {
    if (!projectId) {
      setState({ data: [], status: "idle" });
      return;
    }

    const controller = new AbortController();
    setState((current) => ({ data: current.data, status: "loading" }));
    host
      .listServices(projectId, controller.signal)
      .then((data) => {
        setState({ data, status: "ready" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({ data: [], message: errorMessage(error), status: "error" });
      });

    return () => {
      controller.abort();
    };
  }, [host, projectId]);

  return state;
}

export function useSessionTimeline(
  sessionId: string | undefined,
  active = true,
  onSessionReady?: (session: SessionSummary) => void
) {
  const host = useVibePadHost();
  const [state, setState] = useState<TimelineState>({ status: "idle" });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [interactionRevision, setInteractionRevision] = useState(0);
  const [olderLoadError, setOlderLoadError] = useState<string | undefined>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [running, setRunning] = useState(false);
  const loadedOlder = useRef(false);
  const olderLoadController = useRef<AbortController | undefined>(undefined);
  const olderLoadPending = useRef(false);
  const timelineSession = useRef<string | undefined>(undefined);
  const markTurnStopped = useCallback(() => {
    setRunning(false);
  }, []);

  useEffect(() => {
    if (!sessionId) {
      timelineSession.current = undefined;
      olderLoadController.current?.abort();
      olderLoadController.current = undefined;
      olderLoadPending.current = false;
      loadedOlder.current = false;
      setState({ status: "idle" });
      setInteractionRevision(0);
      setOlderLoadError(undefined);
      setLoadingOlder(false);
      setRunning(false);
      return;
    }

    const sessionChanged = timelineSession.current !== sessionId;
    if (sessionChanged) {
      timelineSession.current = sessionId;
      olderLoadController.current?.abort();
      olderLoadController.current = undefined;
      olderLoadPending.current = false;
      loadedOlder.current = false;
      setOlderLoadError(undefined);
      setLoadingOlder(false);
      setRunning(false);
      setInteractionRevision(0);
    }
    if (!active) {
      return;
    }

    const controller = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let afterCursor: string | undefined;
    let loadInFlight: Promise<void> | undefined;
    let reconnectAttempt = 0;
    let refreshQueued = false;
    const hasCachedTimeline =
      !sessionChanged &&
      stateRef.current.status === "ready" &&
      stateRef.current.sessionId === sessionId;

    const load = async (initial: boolean) => {
      if (initial) {
        setState({ sessionId, status: "loading" });
      }
      try {
        const result = await loadTimelinePage(
          host,
          sessionId,
          controller.signal,
          initial
        );
        if (controller.signal.aborted) {
          return;
        }
        if (result.kind === "bootstrap") {
          onSessionReady?.(result.session);
        }
        setState((current) =>
          loadedTimelineState(
            current,
            result.data,
            sessionId,
            !initial && loadedOlder.current
          )
        );
      } catch (error) {
        if (!(controller.signal.aborted || !initial)) {
          setState({
            message: errorMessage(error),
            sessionId,
            status: "error",
          });
        }
      }
    };

    const requestLoad = (initial: boolean): Promise<void> => {
      if (loadInFlight) {
        if (!initial) {
          refreshQueued = true;
        }
        return loadInFlight;
      }
      loadInFlight = load(initial).finally(() => {
        loadInFlight = undefined;
        if (refreshQueued && !controller.signal.aborted) {
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

    const waitToReconnect = () => {
      const delay = Math.min(15_000, 750 * 2 ** reconnectAttempt);
      reconnectAttempt += 1;
      return new Promise<void>((resolve) => {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined;
          resolve();
        }, delay);
      });
    };

    const consumeEvents = async () => {
      for await (const event of host.subscribeSessionEvents(
        sessionId,
        controller.signal,
        afterCursor
      )) {
        reconnectAttempt = 0;
        afterCursor = event.cursor;
        if (event.kind === "turn.started") {
          setRunning(true);
        } else if (event.kind === "turn.completed") {
          setRunning(false);
        }
        if (changesInteractions(event.kind)) {
          setInteractionRevision((current) => current + 1);
        }
        if (changesTimeline(event.kind)) {
          scheduleRefresh();
        }
      }
    };

    const run = async () => {
      await requestLoad(!hasCachedTimeline);
      while (!controller.signal.aborted) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: A live event stream is intentionally reconnected in order.
          await consumeEvents();
        } catch {
          if (controller.signal.aborted) {
            return;
          }
        }
        await waitToReconnect();
        if (!controller.signal.aborted) {
          await requestLoad(false);
        }
      }
    };

    run().catch(() => undefined);

    return () => {
      controller.abort();
      olderLoadController.current?.abort();
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [active, host, onSessionReady, sessionId]);

  const loadOlder = useCallback(async () => {
    if (
      !sessionId ||
      olderLoadPending.current ||
      state.status !== "ready" ||
      state.sessionId !== sessionId ||
      !state.data.olderCursor
    ) {
      return;
    }
    const controller = new AbortController();
    const cursor = state.data.olderCursor;
    olderLoadController.current?.abort();
    olderLoadController.current = controller;
    olderLoadPending.current = true;
    setOlderLoadError(undefined);
    setLoadingOlder(true);
    try {
      const older = await host.loadTimeline(
        sessionId,
        controller.signal,
        cursor
      );
      if (controller.signal.aborted) {
        return;
      }
      loadedOlder.current = true;
      setState((current) =>
        current.status === "ready" && current.sessionId === sessionId
          ? {
              data: prependOlderTimelinePage(current.data, older),
              sessionId,
              status: "ready",
            }
          : current
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setOlderLoadError(errorMessage(error));
      }
    } finally {
      if (olderLoadController.current === controller) {
        olderLoadController.current = undefined;
        olderLoadPending.current = false;
        setLoadingOlder(false);
      }
    }
  }, [host, sessionId, state]);

  return {
    ...state,
    interactionRevision,
    loadingOlder,
    loadOlder,
    markTurnStopped,
    olderLoadError,
    running,
  };
}

export function useSessionInteractions(
  sessionId: string | undefined,
  revision = 0,
  active = true
) {
  const host = useVibePadHost();
  const requestId = useRef(0);
  const [state, setState] = useState<InteractionsState>({
    data: [],
    status: "idle",
  });

  const refresh = useCallback(
    async (showLoading = true) => {
      const currentRequest = requestId.current + 1;
      requestId.current = currentRequest;
      if (!sessionId) {
        setState({ data: [], status: "idle" });
        return;
      }
      if (showLoading) {
        setState((current) => ({ data: current.data, status: "loading" }));
      }
      try {
        const data = await host.listInteractions(sessionId);
        if (requestId.current === currentRequest) {
          setState({ data, status: "ready" });
        }
      } catch (error) {
        if (requestId.current === currentRequest) {
          setState({
            data: [],
            message: errorMessage(error),
            status: "error",
          });
        }
      }
    },
    [host, sessionId]
  );

  useEffect(() => {
    if (!active) {
      return;
    }
    refresh(revision === 0).catch(() => undefined);
  }, [active, refresh, revision]);

  useEffect(() => {
    if (!(active && sessionId)) {
      return;
    }
    const timer = setInterval(() => {
      refresh(false).catch(() => undefined);
    }, 1500);
    return () => {
      clearInterval(timer);
      requestId.current += 1;
    };
  }, [active, refresh, sessionId]);

  return { refresh, state };
}

export function useProviderCatalog(projectId: string | undefined) {
  const host = useVibePadHost();
  const [state, setState] = useState<CatalogState>({ status: "idle" });

  useEffect(() => {
    if (!projectId) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    host
      .loadCatalog(projectId, controller.signal)
      .then((data) => {
        setState({ data, status: "ready" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ message: errorMessage(error), status: "error" });
        }
      });

    return () => {
      controller.abort();
    };
  }, [host, projectId]);

  return state;
}
