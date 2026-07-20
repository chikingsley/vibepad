import { type Observable, observable } from "@legendapp/state";
import type { ProviderCatalog } from "@vibepad/protocol/catalog";
import type { ServiceSummary } from "@vibepad/protocol/provider";

export type ProjectServicesState =
  | { readonly data: readonly ServiceSummary[]; readonly status: "idle" }
  | { readonly data: readonly ServiceSummary[]; readonly status: "loading" }
  | {
      readonly data: readonly ServiceSummary[];
      readonly message: string;
      readonly status: "error";
    }
  | { readonly data: readonly ServiceSummary[]; readonly status: "ready" };

export type ProviderCatalogState =
  | { readonly data: undefined; readonly status: "idle" }
  | { readonly data: ProviderCatalog | undefined; readonly status: "loading" }
  | {
      readonly data: ProviderCatalog | undefined;
      readonly message: string;
      readonly status: "error";
    }
  | { readonly data: ProviderCatalog; readonly status: "ready" };

export interface ProjectResourcesState {
  catalogsByProjectId: Record<string, ProviderCatalogState>;
  servicesByProjectId: Record<string, ProjectServicesState>;
}

interface ProjectResourceLoader {
  readonly listServices: (
    projectId: string,
    signal?: AbortSignal
  ) => Promise<readonly ServiceSummary[]>;
  readonly loadCatalog: (
    projectId: string,
    signal?: AbortSignal
  ) => Promise<ProviderCatalog>;
}

interface PendingRequest {
  readonly controller: AbortController;
  readonly revision: number;
}

export interface ProjectResourcesStore {
  readonly cancelPending: () => void;
  readonly loadCatalog: (projectId: string, refresh?: boolean) => Promise<void>;
  readonly loadServices: (
    projectId: string,
    refresh?: boolean
  ) => Promise<void>;
  readonly state$: Observable<ProjectResourcesState>;
}

export const idleProjectServicesState: ProjectServicesState = {
  data: [],
  status: "idle",
};

export const idleProviderCatalogState: ProviderCatalogState = {
  data: undefined,
  status: "idle",
};

const resourceErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown VibePad host error";

export function createProjectResourcesStore(
  host: ProjectResourceLoader
): ProjectResourcesStore {
  const state$ = observable<ProjectResourcesState>({
    catalogsByProjectId: {},
    servicesByProjectId: {},
  });
  const catalogRequests = new Map<string, PendingRequest>();
  const serviceRequests = new Map<string, PendingRequest>();

  const loadCatalog = async (projectId: string, refresh = false) => {
    const current =
      state$.catalogsByProjectId[projectId]?.peek() ?? idleProviderCatalogState;
    if (!(refresh || current.status === "idle" || current.status === "error")) {
      return;
    }
    const previous = catalogRequests.get(projectId);
    previous?.controller.abort();
    const request: PendingRequest = {
      controller: new AbortController(),
      revision: (previous?.revision ?? 0) + 1,
    };
    catalogRequests.set(projectId, request);
    state$.catalogsByProjectId.assign({
      [projectId]: { data: current.data, status: "loading" },
    });
    try {
      const data = await host.loadCatalog(projectId, request.controller.signal);
      if (
        !request.controller.signal.aborted &&
        catalogRequests.get(projectId) === request
      ) {
        state$.catalogsByProjectId.assign({
          [projectId]: { data, status: "ready" },
        });
      }
    } catch (error) {
      if (
        !request.controller.signal.aborted &&
        catalogRequests.get(projectId) === request
      ) {
        state$.catalogsByProjectId.assign({
          [projectId]: {
            data: current.data,
            message: resourceErrorMessage(error),
            status: "error",
          },
        });
      }
    } finally {
      if (catalogRequests.get(projectId) === request) {
        catalogRequests.delete(projectId);
      }
    }
  };

  const loadServices = async (projectId: string, refresh = false) => {
    const current =
      state$.servicesByProjectId[projectId]?.peek() ?? idleProjectServicesState;
    if (!(refresh || current.status === "idle" || current.status === "error")) {
      return;
    }
    const previous = serviceRequests.get(projectId);
    previous?.controller.abort();
    const request: PendingRequest = {
      controller: new AbortController(),
      revision: (previous?.revision ?? 0) + 1,
    };
    serviceRequests.set(projectId, request);
    state$.servicesByProjectId.assign({
      [projectId]: { data: current.data, status: "loading" },
    });
    try {
      const data = await host.listServices(
        projectId,
        request.controller.signal
      );
      if (
        !request.controller.signal.aborted &&
        serviceRequests.get(projectId) === request
      ) {
        state$.servicesByProjectId.assign({
          [projectId]: { data, status: "ready" },
        });
      }
    } catch (error) {
      if (
        !request.controller.signal.aborted &&
        serviceRequests.get(projectId) === request
      ) {
        state$.servicesByProjectId.assign({
          [projectId]: {
            data: current.data,
            message: resourceErrorMessage(error),
            status: "error",
          },
        });
      }
    } finally {
      if (serviceRequests.get(projectId) === request) {
        serviceRequests.delete(projectId);
      }
    }
  };

  return {
    cancelPending: () => {
      for (const [projectId, { controller }] of catalogRequests) {
        controller.abort();
        if (
          state$.catalogsByProjectId[projectId]?.peek().status === "loading"
        ) {
          state$.catalogsByProjectId.assign({
            [projectId]: idleProviderCatalogState,
          });
        }
      }
      for (const [projectId, { controller }] of serviceRequests) {
        controller.abort();
        if (
          state$.servicesByProjectId[projectId]?.peek().status === "loading"
        ) {
          state$.servicesByProjectId.assign({
            [projectId]: idleProjectServicesState,
          });
        }
      }
      catalogRequests.clear();
      serviceRequests.clear();
    },
    loadCatalog,
    loadServices,
    state$,
  };
}
