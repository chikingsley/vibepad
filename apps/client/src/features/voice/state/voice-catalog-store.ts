import { type Observable, observable } from "@legendapp/state";
import type { VoiceCleanupModel } from "@vibepad/protocol/voice";

interface VoiceCatalogHost {
  readonly loadVoiceCleanupModels: (
    signal?: AbortSignal
  ) => Promise<readonly VoiceCleanupModel[]>;
}

export interface VoiceCatalogState {
  readonly errorMessage: string | undefined;
  readonly models: readonly VoiceCleanupModel[];
  readonly status: "error" | "idle" | "loading" | "ready";
}

export interface VoiceCatalogStore {
  readonly cancelPending: () => void;
  readonly load: (refresh?: boolean) => Promise<void>;
  readonly state$: Observable<VoiceCatalogState>;
}

export const idleVoiceCatalogState: VoiceCatalogState = {
  errorMessage: undefined,
  models: [],
  status: "idle",
};

const catalogErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to load Voice Lab models";

export function createVoiceCatalogStore(
  host: VoiceCatalogHost
): VoiceCatalogStore {
  const state$ = observable<VoiceCatalogState>({
    ...idleVoiceCatalogState,
    models: [],
  });
  let controller: AbortController | undefined;
  let revision = 0;

  const load = async (refresh = false) => {
    const current = state$.peek();
    if (!(refresh || current.status === "idle" || current.status === "error")) {
      return;
    }
    controller?.abort();
    controller = new AbortController();
    revision += 1;
    const requestRevision = revision;
    const requestController = controller;
    state$.set({
      errorMessage: undefined,
      models: current.models,
      status: "loading",
    });
    try {
      const models = await host.loadVoiceCleanupModels(
        requestController.signal
      );
      if (!requestController.signal.aborted && revision === requestRevision) {
        state$.set({ errorMessage: undefined, models, status: "ready" });
      }
    } catch (error) {
      if (!requestController.signal.aborted && revision === requestRevision) {
        state$.set({
          errorMessage: catalogErrorMessage(error),
          models: current.models,
          status: "error",
        });
      }
    }
  };

  return {
    cancelPending: () => {
      revision += 1;
      controller?.abort();
      if (state$.status.peek() === "loading") {
        state$.status.set("idle");
      }
    },
    load,
    state$,
  };
}
