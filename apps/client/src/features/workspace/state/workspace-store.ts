import { batch, type Observable, observable } from "@legendapp/state";
import type { ProviderManifest } from "@vibepad/protocol/capabilities";
import type {
  ProjectSummary,
  SessionSummary,
} from "@vibepad/protocol/provider";
import type { HostHealthResponse } from "@vibepad/protocol/transport";

import type { VibePadHostClient, WorkspaceSnapshot } from "@/lib/vibepad-host";

export type WorkspaceViewState =
  | { readonly status: "loading" }
  | { readonly message: string; readonly status: "error" }
  | { readonly data: WorkspaceSnapshot; readonly status: "ready" };

export interface WorkspaceRegistryState {
  errorMessage: string | undefined;
  health: HostHealthResponse | undefined;
  projectIds: string[];
  projectsById: Record<string, ProjectSummary>;
  providerIds: string[];
  providersById: Record<string, ProviderManifest>;
  sessionIds: string[];
  sessionIdsByProjectId: Record<string, string[]>;
  sessionsById: Record<string, SessionSummary>;
  status: "error" | "loading" | "ready";
}

interface WorkspaceLoader {
  readonly loadWorkspace: VibePadHostClient["loadWorkspace"];
}

export interface WorkspaceStore {
  readonly cancelPending: () => void;
  readonly project$: (
    projectId: string
  ) => Observable<ProjectSummary> | undefined;
  readonly projectSessionIds$: (
    projectId: string
  ) => Observable<string[]> | undefined;
  readonly readView: () => WorkspaceViewState;
  readonly refresh: () => Promise<void>;
  readonly removeSession: (sessionId: string) => void;
  readonly session$: (
    sessionId: string
  ) => Observable<SessionSummary> | undefined;
  readonly state$: Observable<WorkspaceRegistryState>;
  readonly upsertSession: (session: SessionSummary) => void;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown VibePad host error";

const indexById = <T extends { readonly id: string }>(items: readonly T[]) =>
  Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, T>;

const indexSessionIdsByProject = (sessions: readonly SessionSummary[]) => {
  const byProject: Record<string, string[]> = {};
  for (const session of sessions) {
    const current = byProject[session.projectId] ?? [];
    current.push(session.id);
    byProject[session.projectId] = current;
  }
  return byProject;
};

export function createWorkspaceStore(host: WorkspaceLoader): WorkspaceStore {
  const state$ = observable<WorkspaceRegistryState>({
    errorMessage: undefined,
    health: undefined,
    projectIds: [],
    projectsById: {},
    providerIds: [],
    providersById: {},
    sessionIds: [],
    sessionIdsByProjectId: {},
    sessionsById: {},
    status: "loading",
  });
  let requestId = 0;

  const replaceSnapshot = (snapshot: WorkspaceSnapshot) => {
    batch(() => {
      state$.errorMessage.set(undefined);
      state$.health.set(snapshot.health);
      state$.projectIds.set(snapshot.projects.map(({ id }) => id));
      state$.projectsById.set(indexById(snapshot.projects));
      state$.providerIds.set(snapshot.providers.map(({ id }) => id));
      state$.providersById.set(indexById(snapshot.providers));
      state$.sessionIds.set(snapshot.sessions.map(({ id }) => id));
      state$.sessionIdsByProjectId.set(
        indexSessionIdsByProject(snapshot.sessions)
      );
      state$.sessionsById.set(indexById(snapshot.sessions));
      state$.status.set("ready");
    });
  };

  const refresh = async () => {
    const currentRequest = requestId + 1;
    requestId = currentRequest;
    if (state$.status.peek() !== "ready") {
      state$.status.set("loading");
    }
    try {
      const snapshot = await host.loadWorkspace();
      if (requestId === currentRequest) {
        replaceSnapshot(snapshot);
      }
    } catch (error) {
      if (requestId === currentRequest) {
        batch(() => {
          state$.errorMessage.set(errorMessage(error));
          state$.status.set("error");
        });
      }
    }
  };

  const upsertSession = (session: SessionSummary) => {
    const previous = state$.sessionsById[session.id]?.peek();
    batch(() => {
      if (!state$.sessionIds.peek().includes(session.id)) {
        state$.sessionIds.set([session.id, ...state$.sessionIds.peek()]);
      }
      if (previous?.projectId !== session.projectId) {
        if (previous) {
          const previousProjectIds =
            state$.sessionIdsByProjectId[previous.projectId]?.peek() ?? [];
          state$.sessionIdsByProjectId.assign({
            [previous.projectId]: previousProjectIds.filter(
              (candidate) => candidate !== session.id
            ),
          });
        }
        const projectIds =
          state$.sessionIdsByProjectId[session.projectId]?.peek() ?? [];
        if (!projectIds.includes(session.id)) {
          state$.sessionIdsByProjectId.assign({
            [session.projectId]: [session.id, ...projectIds],
          });
        }
      }
      state$.sessionsById.assign({ [session.id]: session });
    });
  };

  const removeSession = (sessionId: string) => {
    const session = state$.sessionsById[sessionId]?.peek();
    batch(() => {
      state$.sessionIds.set(
        state$.sessionIds.peek().filter((candidate) => candidate !== sessionId)
      );
      if (session) {
        const projectIds =
          state$.sessionIdsByProjectId[session.projectId]?.peek() ?? [];
        state$.sessionIdsByProjectId.assign({
          [session.projectId]: projectIds.filter(
            (candidate) => candidate !== sessionId
          ),
        });
      }
      state$.sessionsById[sessionId]?.delete();
    });
  };

  const readView = (): WorkspaceViewState => {
    const status = state$.status.get();
    if (status === "loading") {
      return { status };
    }
    if (status === "error") {
      return {
        message: state$.errorMessage.get() ?? "Unknown VibePad host error",
        status,
      };
    }
    const health = state$.health.get();
    if (!health) {
      return { status: "loading" };
    }
    const readProject = (id: string) => {
      const project$ = state$.projectsById[id];
      if (!project$) {
        throw new Error(`Workspace project registry is missing ${id}`);
      }
      return project$.get();
    };
    const readProvider = (id: string) => {
      const provider$ = state$.providersById[id];
      if (!provider$) {
        throw new Error(`Workspace provider registry is missing ${id}`);
      }
      return provider$.get();
    };
    const readSession = (id: string) => {
      const session$ = state$.sessionsById[id];
      if (!session$) {
        throw new Error(`Workspace session registry is missing ${id}`);
      }
      return session$.get();
    };
    return {
      data: {
        health,
        projects: state$.projectIds.get().map(readProject),
        providers: state$.providerIds.get().map(readProvider),
        sessions: state$.sessionIds.get().map(readSession),
      },
      status,
    };
  };

  return {
    cancelPending: () => {
      requestId += 1;
    },
    project$: (projectId) =>
      state$.projectsById.peek()[projectId] === undefined
        ? undefined
        : state$.projectsById[projectId],
    projectSessionIds$: (projectId) =>
      state$.sessionIdsByProjectId.peek()[projectId] === undefined
        ? undefined
        : state$.sessionIdsByProjectId[projectId],
    readView,
    refresh,
    removeSession,
    session$: (sessionId) =>
      state$.sessionsById.peek()[sessionId] === undefined
        ? undefined
        : state$.sessionsById[sessionId],
    state$,
    upsertSession,
  };
}
