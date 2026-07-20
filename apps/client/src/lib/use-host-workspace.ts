import { useValue } from "@legendapp/state/react";
import type { PendingInteraction } from "@vibepad/protocol/interactions";
import type { TimelinePage } from "@vibepad/protocol/timeline";
import { useCallback, useEffect } from "react";
import { idleSessionRuntime } from "@/features/timeline/state/session-runtime-state";
import {
  idleProjectServicesState,
  idleProviderCatalogState,
} from "@/features/workspace/state/project-resources-store";
import {
  useVibePadProjectResourcesStore,
  useVibePadSessionRuntimeStore,
  useVibePadWorkspaceStore,
} from "@/lib/vibepad-host-context";

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
  const resources = useVibePadProjectResourcesStore();

  useEffect(() => {
    if (projectId) {
      resources.loadServices(projectId).catch(() => undefined);
    }
  }, [projectId, resources]);

  return useValue(() =>
    projectId
      ? (resources.state$.servicesByProjectId[projectId]?.get() ??
        idleProjectServicesState)
      : idleProjectServicesState
  );
}

export function useSessionTimeline(
  sessionId: string | undefined,
  active = true
) {
  const runtime = useVibePadSessionRuntimeStore();

  useEffect(() => {
    if (sessionId && active) {
      return runtime.activateSession(sessionId);
    }
  }, [active, runtime, sessionId]);

  const record = useValue(() =>
    sessionId
      ? (runtime.state$.bySessionId[sessionId]?.get() ?? idleSessionRuntime)
      : idleSessionRuntime
  );
  let state: TimelineState = { status: "idle" };
  if (sessionId) {
    if (record.timelineStatus === "error") {
      state = {
        message: record.timelineError ?? "Unknown VibePad host error",
        sessionId,
        status: "error",
      };
    } else if (record.timelineStatus === "ready" && record.timeline) {
      state = { data: record.timeline, sessionId, status: "ready" };
    } else {
      state = { sessionId, status: "loading" };
    }
  }

  const loadOlder = useCallback(
    () => (sessionId ? runtime.loadOlder(sessionId) : Promise.resolve()),
    [runtime, sessionId]
  );
  const markTurnStopped = useCallback(() => {
    if (sessionId) {
      runtime.markTurnStopped(sessionId);
    }
  }, [runtime, sessionId]);

  return {
    ...state,
    loadingOlder: record.loadingOlder,
    loadOlder,
    markTurnStopped,
    olderLoadError: record.olderLoadError,
    running: record.running,
  };
}

export function useSessionInteractions(
  sessionId: string | undefined,
  active = true
) {
  const runtime = useVibePadSessionRuntimeStore();
  const record = useValue(() =>
    sessionId
      ? (runtime.state$.bySessionId[sessionId]?.get() ?? idleSessionRuntime)
      : idleSessionRuntime
  );
  const refresh = useCallback(
    (showLoading = true) =>
      sessionId
        ? runtime.refreshInteractions(sessionId, showLoading)
        : Promise.resolve(),
    [runtime, sessionId]
  );
  let state: InteractionsState = { data: [], status: "idle" };
  if (sessionId && active) {
    if (record.interactionsStatus === "error") {
      state = {
        data: record.interactions,
        message: record.interactionsError ?? "Unknown VibePad host error",
        status: "error",
      };
    } else {
      state = {
        data: record.interactions,
        status: record.interactionsStatus,
      };
    }
  }
  return { refresh, state };
}

export function useProviderCatalog(projectId: string | undefined) {
  const resources = useVibePadProjectResourcesStore();

  useEffect(() => {
    if (projectId) {
      resources.loadCatalog(projectId).catch(() => undefined);
    }
  }, [projectId, resources]);

  return useValue(() =>
    projectId
      ? (resources.state$.catalogsByProjectId[projectId]?.get() ??
        idleProviderCatalogState)
      : idleProviderCatalogState
  );
}
