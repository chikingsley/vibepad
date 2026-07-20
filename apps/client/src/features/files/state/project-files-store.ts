import { type Observable, observable } from "@legendapp/state";
import type {
  WorkspaceFileChange,
  WorkspaceFileContent,
  WorkspaceFileNode,
} from "@vibepad/protocol/files";

import {
  idleFileChangesState,
  idleFileContentState,
  idleFileNodesState,
  type ProjectFilesState,
} from "./project-files-state";

interface ProjectFilesHost {
  readonly listFileChanges: (
    projectId: string,
    signal?: AbortSignal
  ) => Promise<readonly WorkspaceFileChange[]>;
  readonly listFiles: (
    projectId: string,
    path: string,
    signal?: AbortSignal
  ) => Promise<readonly WorkspaceFileNode[]>;
  readonly readFile: (
    projectId: string,
    path: string,
    signal?: AbortSignal
  ) => Promise<WorkspaceFileContent>;
}

interface PendingRequest {
  readonly controller: AbortController;
  readonly revision: number;
}

export interface ProjectFilesStore {
  readonly cancelPending: () => void;
  readonly loadChanges: (projectId: string, refresh?: boolean) => Promise<void>;
  readonly loadContent: (
    projectId: string,
    path: string,
    refresh?: boolean
  ) => Promise<void>;
  readonly loadDirectory: (
    projectId: string,
    path: string,
    refresh?: boolean
  ) => Promise<void>;
  readonly state$: Observable<ProjectFilesState>;
}

const requestKey = (projectId: string, path: string) =>
  JSON.stringify([projectId, path]);

const resourceErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown VibePad host error";

export function createProjectFilesStore(
  host: ProjectFilesHost
): ProjectFilesStore {
  const state$ = observable<ProjectFilesState>({
    changesByProjectId: {},
    contentsByProjectId: {},
    directoriesByProjectId: {},
  });
  const changeRequests = new Map<string, PendingRequest>();
  const contentRequests = new Map<string, PendingRequest>();
  const directoryRequests = new Map<string, PendingRequest>();
  let nextRevision = 0;

  const beginRequest = (requests: Map<string, PendingRequest>, key: string) => {
    requests.get(key)?.controller.abort();
    nextRevision += 1;
    const request: PendingRequest = {
      controller: new AbortController(),
      revision: nextRevision,
    };
    requests.set(key, request);
    return request;
  };

  const isCurrent = (
    requests: Map<string, PendingRequest>,
    key: string,
    request: PendingRequest
  ) => !request.controller.signal.aborted && requests.get(key) === request;

  const finishRequest = (
    requests: Map<string, PendingRequest>,
    key: string,
    request: PendingRequest
  ) => {
    if (requests.get(key) === request) {
      requests.delete(key);
    }
  };

  const directoryProject$ = (projectId: string) => {
    if (state$.directoriesByProjectId.peek()[projectId] === undefined) {
      state$.directoriesByProjectId.assign({ [projectId]: {} });
    }
    const project$ = state$.directoriesByProjectId[projectId];
    if (!project$) {
      throw new Error(`Legend did not create a file registry for ${projectId}`);
    }
    return project$;
  };

  const contentProject$ = (projectId: string) => {
    if (state$.contentsByProjectId.peek()[projectId] === undefined) {
      state$.contentsByProjectId.assign({ [projectId]: {} });
    }
    const project$ = state$.contentsByProjectId[projectId];
    if (!project$) {
      throw new Error(
        `Legend did not create a file-content registry for ${projectId}`
      );
    }
    return project$;
  };

  const loadChanges = async (projectId: string, refresh = false) => {
    const current =
      state$.changesByProjectId[projectId]?.peek() ?? idleFileChangesState;
    if (!(refresh || current.status === "idle" || current.status === "error")) {
      return;
    }
    const request = beginRequest(changeRequests, projectId);
    state$.changesByProjectId.assign({
      [projectId]: { data: current.data, status: "loading" },
    });
    try {
      const data = await host.listFileChanges(
        projectId,
        request.controller.signal
      );
      if (isCurrent(changeRequests, projectId, request)) {
        state$.changesByProjectId.assign({
          [projectId]: { data, status: "ready" },
        });
      }
    } catch (error) {
      if (isCurrent(changeRequests, projectId, request)) {
        state$.changesByProjectId.assign({
          [projectId]: {
            data: current.data,
            message: resourceErrorMessage(error),
            status: "error",
          },
        });
      }
    } finally {
      finishRequest(changeRequests, projectId, request);
    }
  };

  const loadDirectory = async (
    projectId: string,
    path: string,
    refresh = false
  ) => {
    const project$ = directoryProject$(projectId);
    const current = project$[path]?.peek() ?? idleFileNodesState;
    if (!(refresh || current.status === "idle" || current.status === "error")) {
      return;
    }
    const key = requestKey(projectId, path);
    const request = beginRequest(directoryRequests, key);
    project$.assign({ [path]: { data: current.data, status: "loading" } });
    try {
      const data = await host.listFiles(
        projectId,
        path,
        request.controller.signal
      );
      if (isCurrent(directoryRequests, key, request)) {
        project$.assign({ [path]: { data, status: "ready" } });
      }
    } catch (error) {
      if (isCurrent(directoryRequests, key, request)) {
        project$.assign({
          [path]: {
            data: current.data,
            message: resourceErrorMessage(error),
            status: "error",
          },
        });
      }
    } finally {
      finishRequest(directoryRequests, key, request);
    }
  };

  const loadContent = async (
    projectId: string,
    path: string,
    refresh = false
  ) => {
    const project$ = contentProject$(projectId);
    const current = project$[path]?.peek() ?? idleFileContentState;
    if (!(refresh || current.status === "idle" || current.status === "error")) {
      return;
    }
    const key = requestKey(projectId, path);
    const request = beginRequest(contentRequests, key);
    project$.assign({ [path]: { status: "loading" } });
    try {
      const data = await host.readFile(
        projectId,
        path,
        request.controller.signal
      );
      if (isCurrent(contentRequests, key, request)) {
        project$.assign({ [path]: { data, status: "ready" } });
      }
    } catch (error) {
      if (isCurrent(contentRequests, key, request)) {
        project$.assign({
          [path]: { message: resourceErrorMessage(error), status: "error" },
        });
      }
    } finally {
      finishRequest(contentRequests, key, request);
    }
  };

  return {
    cancelPending: () => {
      for (const [projectId, { controller }] of changeRequests) {
        controller.abort();
        const current = state$.changesByProjectId[projectId]?.peek();
        if (current?.status === "loading") {
          state$.changesByProjectId.assign({
            [projectId]: { data: current.data, status: "idle" },
          });
        }
      }
      for (const [key, { controller }] of contentRequests) {
        controller.abort();
        const [projectId, path] = JSON.parse(key) as [string, string];
        const project$ = state$.contentsByProjectId[projectId];
        if (project$?.[path]?.peek().status === "loading") {
          project$.assign({ [path]: idleFileContentState });
        }
      }
      for (const [key, { controller }] of directoryRequests) {
        controller.abort();
        const [projectId, path] = JSON.parse(key) as [string, string];
        const project$ = state$.directoriesByProjectId[projectId];
        const current = project$?.[path]?.peek();
        if (project$ && current?.status === "loading") {
          project$.assign({
            [path]: { data: current.data, status: "idle" },
          });
        }
      }
      changeRequests.clear();
      contentRequests.clear();
      directoryRequests.clear();
    },
    loadChanges,
    loadContent,
    loadDirectory,
    state$,
  };
}
