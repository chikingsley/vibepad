import { batch, type Observable, observable } from "@legendapp/state";

import type { SettingsPage } from "@/features/settings/settings-page";
import type { SessionSurface } from "@/features/workspace/components/session-workbench-controls";
import type { WorkspaceUiStorage } from "@/features/workspace/storage/workspace-ui-storage";
import {
  clampWorkbenchSplitRatio,
  defaultWorkbenchLayout,
  type SessionWorkbenchLayout,
  type WorkspaceUiSnapshot,
  workspaceUiSnapshotSchemaVersion,
} from "./workspace-ui-persistence";

export interface WorkspaceUiState {
  desktopSidebarOpen: boolean;
  expandedProjects: Record<string, boolean>;
  mobileSidebarOpen: boolean;
  selectedSessionId: string | undefined;
  settingsOpen: boolean;
  settingsPage: SettingsPage;
  workbenchesBySessionId: Record<string, SessionWorkbenchLayout>;
}

export interface WorkspaceUiStore {
  readonly cancelPending: () => void;
  readonly closeMobileSidebar: () => void;
  readonly closeSettings: () => void;
  readonly closeWorkbench: (sessionId: string) => void;
  readonly load: () => Promise<void>;
  readonly reconcileSessions: (
    sessionIds: readonly string[],
    defaultSessionId: string | undefined,
    defaultProjectId?: string
  ) => void;
  readonly removeSession: (sessionId: string) => void;
  readonly selectSession: (sessionId: string, projectId?: string) => void;
  readonly selectSurface: (sessionId: string, surface: SessionSurface) => void;
  readonly setProjectExpanded: (projectId: string, expanded: boolean) => void;
  readonly setWorkbenchSplitRatio: (sessionId: string, ratio: number) => void;
  readonly showSettings: (page: SettingsPage) => void;
  readonly state$: Observable<WorkspaceUiState>;
  readonly toggleSidebar: (regularLayout: boolean) => void;
  readonly toggleWorkbenchExpanded: (sessionId: string) => void;
  readonly waitForPersistence: () => Promise<void>;
  readonly workbenchFor: (
    sessionId: string | undefined
  ) => SessionWorkbenchLayout;
}

const snapshotFor = (state: WorkspaceUiState): WorkspaceUiSnapshot => ({
  desktopSidebarOpen: state.desktopSidebarOpen,
  expandedProjects: state.expandedProjects,
  schemaVersion: workspaceUiSnapshotSchemaVersion,
  workbenchesBySessionId: state.workbenchesBySessionId,
});

export function createWorkspaceUiStore(
  storage?: WorkspaceUiStorage,
  hostId = "local"
): WorkspaceUiStore {
  const state$ = observable<WorkspaceUiState>({
    desktopSidebarOpen: true,
    expandedProjects: {},
    mobileSidebarOpen: false,
    selectedSessionId: undefined,
    settingsOpen: false,
    settingsPage: "timeline",
    workbenchesBySessionId: {},
  });
  let availableSessionIds: readonly string[] = [];
  let loadRevision = 0;
  let sessionsInitialized = false;
  let writeRevision = 0;
  let writeQueue = Promise.resolve();

  const persist = () => {
    if (!storage) {
      return;
    }
    writeRevision += 1;
    const snapshot = snapshotFor(state$.peek());
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(() => storage.write(hostId, snapshot));
  };

  const workbenchFor = (sessionId: string | undefined) => {
    if (!sessionId) {
      return defaultWorkbenchLayout;
    }
    return (
      state$.workbenchesBySessionId[sessionId]?.peek() ?? defaultWorkbenchLayout
    );
  };

  const updateWorkbench = (
    sessionId: string,
    transform: (previous: SessionWorkbenchLayout) => SessionWorkbenchLayout
  ) => {
    state$.workbenchesBySessionId.assign({
      [sessionId]: transform(workbenchFor(sessionId)),
    });
    persist();
  };

  return {
    cancelPending: () => {
      loadRevision += 1;
    },
    closeMobileSidebar: () => {
      state$.mobileSidebarOpen.set(false);
    },
    closeSettings: () => {
      state$.settingsOpen.set(false);
    },
    closeWorkbench: (sessionId) => {
      updateWorkbench(sessionId, (previous) => ({
        ...previous,
        expanded: false,
        open: false,
      }));
    },
    load: async () => {
      if (!storage) {
        return;
      }
      const revision = loadRevision + 1;
      loadRevision = revision;
      const stored = await storage.read(hostId);
      if (loadRevision !== revision || writeRevision > 0 || !stored) {
        return;
      }
      batch(() => {
        state$.desktopSidebarOpen.set(stored.desktopSidebarOpen);
        state$.expandedProjects.set(stored.expandedProjects);
        state$.workbenchesBySessionId.set(stored.workbenchesBySessionId);
      });
    },
    reconcileSessions: (sessionIds, defaultSessionId, defaultProjectId) => {
      availableSessionIds = sessionIds;
      const availableIds = new Set(sessionIds);
      const selectedSessionId = state$.selectedSessionId.peek();
      if (!sessionsInitialized) {
        sessionsInitialized = true;
        batch(() => {
          state$.selectedSessionId.set(defaultSessionId);
          if (defaultProjectId) {
            state$.expandedProjects.assign({ [defaultProjectId]: true });
          }
        });
        return;
      }
      if (selectedSessionId && availableIds.has(selectedSessionId)) {
        return;
      }
      state$.selectedSessionId.set(defaultSessionId ?? sessionIds[0]);
    },
    removeSession: (sessionId) => {
      const closingIndex = availableSessionIds.indexOf(sessionId);
      availableSessionIds = availableSessionIds.filter(
        (availableId) => availableId !== sessionId
      );
      batch(() => {
        if (state$.selectedSessionId.peek() === sessionId) {
          const nextIndex = Math.min(
            Math.max(closingIndex, 0),
            availableSessionIds.length - 1
          );
          state$.selectedSessionId.set(
            nextIndex >= 0 ? availableSessionIds[nextIndex] : undefined
          );
        }
        state$.workbenchesBySessionId[sessionId]?.delete();
      });
      persist();
    },
    selectSession: (sessionId, projectId) => {
      batch(() => {
        state$.selectedSessionId.set(sessionId);
        state$.mobileSidebarOpen.set(false);
        if (projectId) {
          state$.expandedProjects.assign({ [projectId]: true });
        }
      });
      if (projectId) {
        persist();
      }
    },
    selectSurface: (sessionId, surface) => {
      updateWorkbench(sessionId, (previous) => {
        if (surface === "chat") {
          return { ...previous, expanded: false, open: false };
        }
        const changingSurface = !previous.open || previous.surface !== surface;
        return {
          ...previous,
          expanded: changingSurface
            ? surface === "files" || surface === "changes"
            : previous.expanded,
          open: true,
          surface,
        };
      });
    },
    setProjectExpanded: (projectId, expanded) => {
      state$.expandedProjects.assign({ [projectId]: expanded });
      persist();
    },
    setWorkbenchSplitRatio: (sessionId, ratio) => {
      updateWorkbench(sessionId, (previous) => ({
        ...previous,
        splitRatio: clampWorkbenchSplitRatio(ratio),
      }));
    },
    showSettings: (page) => {
      batch(() => {
        state$.settingsPage.set(page);
        state$.settingsOpen.set(true);
      });
    },
    state$,
    toggleSidebar: (regularLayout) => {
      if (regularLayout) {
        state$.desktopSidebarOpen.toggle();
        persist();
      } else {
        state$.mobileSidebarOpen.toggle();
      }
    },
    toggleWorkbenchExpanded: (sessionId) => {
      updateWorkbench(sessionId, (previous) => ({
        ...previous,
        expanded: !previous.expanded,
        open: true,
      }));
    },
    waitForPersistence: () => writeQueue,
    workbenchFor,
  };
}
