import { batch, type Observable, observable } from "@legendapp/state";
import type { SessionSummary } from "@vibepad/protocol/provider";

import { prependOlderTimelinePage } from "../model/timeline-pages";
import {
  createSessionActivation,
  type SessionActivation,
} from "./session-runtime-activation";
import type { SessionRuntimeHost } from "./session-runtime-host";
import {
  createIdleSessionRuntime,
  type SessionRuntimeState,
} from "./session-runtime-state";

export interface SessionRuntimeStore {
  readonly activateSession: (sessionId: string) => () => void;
  readonly cancelPending: () => void;
  readonly loadOlder: (sessionId: string) => Promise<void>;
  readonly markTurnStopped: (sessionId: string) => void;
  readonly refreshInteractions: (
    sessionId: string,
    showLoading?: boolean
  ) => Promise<void>;
  readonly state$: Observable<SessionRuntimeState>;
}

const runtimeErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown VibePad host error";

export function createSessionRuntimeStore(
  host: SessionRuntimeHost,
  onSessionReady: (session: SessionSummary) => void
): SessionRuntimeStore {
  const state$ = observable<SessionRuntimeState>({ bySessionId: {} });
  const activations = new Map<string, SessionActivation>();
  const interactionRequests = new Map<string, number>();
  const loadedOlder = new Set<string>();
  const olderControllers = new Map<string, AbortController>();

  const ensureSession = (sessionId: string) => {
    if (state$.bySessionId.peek()[sessionId] === undefined) {
      state$.bySessionId.assign({
        [sessionId]: createIdleSessionRuntime(),
      });
    }
    const session$ = state$.bySessionId[sessionId];
    if (!session$) {
      throw new Error(`Legend did not create runtime state for ${sessionId}`);
    }
    return session$;
  };

  const refreshInteractions = async (sessionId: string, showLoading = true) => {
    const session$ = ensureSession(sessionId);
    const revision = (interactionRequests.get(sessionId) ?? 0) + 1;
    interactionRequests.set(sessionId, revision);
    if (showLoading) {
      session$.interactionsStatus.set("loading");
    }
    try {
      const interactionSignal = activations.get(sessionId)?.controller.signal;
      const interactions = await host.listInteractions(
        sessionId,
        interactionSignal
      );
      if (interactionRequests.get(sessionId) === revision) {
        batch(() => {
          session$.interactions.set(interactions);
          session$.interactionsError.set(undefined);
          session$.interactionsStatus.set("ready");
        });
      }
    } catch (error) {
      if (interactionRequests.get(sessionId) === revision) {
        batch(() => {
          session$.interactions.set([]);
          session$.interactionsError.set(runtimeErrorMessage(error));
          session$.interactionsStatus.set("error");
        });
      }
    }
  };

  const loadOlder = async (sessionId: string) => {
    const session$ = ensureSession(sessionId);
    const timeline = session$.timeline.peek();
    if (
      olderControllers.has(sessionId) ||
      session$.timelineStatus.peek() !== "ready" ||
      !timeline?.olderCursor
    ) {
      return;
    }
    const controller = new AbortController();
    olderControllers.set(sessionId, controller);
    batch(() => {
      session$.olderLoadError.set(undefined);
      session$.loadingOlder.set(true);
    });
    try {
      const older = await host.loadTimeline(
        sessionId,
        controller.signal,
        timeline.olderCursor
      );
      if (
        controller.signal.aborted ||
        olderControllers.get(sessionId) !== controller
      ) {
        return;
      }
      const current = session$.timeline.peek();
      if (current) {
        loadedOlder.add(sessionId);
        session$.timeline.set(prependOlderTimelinePage(current, older));
      }
    } catch (error) {
      if (
        !controller.signal.aborted &&
        olderControllers.get(sessionId) === controller
      ) {
        session$.olderLoadError.set(runtimeErrorMessage(error));
      }
    } finally {
      if (olderControllers.get(sessionId) === controller) {
        olderControllers.delete(sessionId);
        session$.loadingOlder.set(false);
      }
    }
  };

  const activateSession = (sessionId: string) => {
    activations.get(sessionId)?.stop();
    const session$ = ensureSession(sessionId);
    let activation: SessionActivation;
    const transport = createSessionActivation({
      host,
      isCurrent: () => activations.get(sessionId) === activation,
      onSessionReady,
      preserveLoadedHistory: () => loadedOlder.has(sessionId),
      refreshInteractions: (showLoading) =>
        refreshInteractions(sessionId, showLoading),
      session$,
      sessionId,
    });
    const stop = () => {
      transport.stop();
      if (activations.get(sessionId) === activation) {
        activations.delete(sessionId);
      }
    };
    activation = { ...transport, stop };
    activations.set(sessionId, activation);
    activation.start();
    return stop;
  };

  return {
    activateSession,
    cancelPending: () => {
      for (const activation of [...activations.values()]) {
        activation.stop();
      }
      for (const [sessionId, controller] of olderControllers) {
        controller.abort();
        state$.bySessionId[sessionId]?.loadingOlder.set(false);
      }
      activations.clear();
      interactionRequests.clear();
      olderControllers.clear();
    },
    loadOlder,
    markTurnStopped: (sessionId) => {
      ensureSession(sessionId).running.set(false);
    },
    refreshInteractions,
    state$,
  };
}
