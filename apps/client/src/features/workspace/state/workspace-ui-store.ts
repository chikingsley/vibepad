import { batch, type Observable, observable } from "@legendapp/state";

import type { SettingsPage } from "@/features/settings/settings-page";
import type { SessionSurface } from "@/features/workspace/components/session-workbench-controls";

export interface SessionWorkbenchLayout {
  readonly expanded: boolean;
  readonly open: boolean;
  readonly surface: Exclude<SessionSurface, "chat">;
}

export interface WorkspaceUiState {
  desktopSidebarOpen: boolean;
  expandedProjects: Record<string, boolean>;
  mobileSidebarOpen: boolean;
  openSessionIds: string[];
  selectedSessionId: string | undefined;
  settingsOpen: boolean;
  settingsPage: SettingsPage;
  workbenchesBySessionId: Record<string, SessionWorkbenchLayout>;
}

export interface WorkspaceUiStore {
  readonly closeMobileSidebar: () => void;
  readonly closeSessionTab: (sessionId: string) => void;
  readonly closeSettings: () => void;
  readonly closeWorkbench: (sessionId: string) => void;
  readonly reconcileSessions: (
    sessionIds: readonly string[],
    defaultSessionId: string | undefined,
    defaultProjectId?: string
  ) => void;
  readonly removeSession: (sessionId: string) => void;
  readonly selectSession: (sessionId: string, projectId?: string) => void;
  readonly selectSurface: (sessionId: string, surface: SessionSurface) => void;
  readonly setProjectExpanded: (projectId: string, expanded: boolean) => void;
  readonly showSettings: (page: SettingsPage) => void;
  readonly state$: Observable<WorkspaceUiState>;
  readonly toggleSidebar: (regularLayout: boolean) => void;
  readonly toggleWorkbenchExpanded: (sessionId: string) => void;
  readonly workbenchFor: (
    sessionId: string | undefined
  ) => SessionWorkbenchLayout;
}

export const defaultWorkbenchLayout: SessionWorkbenchLayout = {
  expanded: false,
  open: false,
  surface: "changes",
};

const sameIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length &&
  left.every((id, index) => id === right[index]);

export function createWorkspaceUiStore(): WorkspaceUiStore {
  const state$ = observable<WorkspaceUiState>({
    desktopSidebarOpen: true,
    expandedProjects: {},
    mobileSidebarOpen: false,
    openSessionIds: [],
    selectedSessionId: undefined,
    settingsOpen: false,
    settingsPage: "timeline",
    workbenchesBySessionId: {},
  });
  let sessionsInitialized = false;

  const removeSession = (sessionId: string) => {
    const openSessionIds = state$.openSessionIds.peek();
    const closingIndex = openSessionIds.indexOf(sessionId);
    const remainingIds = openSessionIds.filter((id) => id !== sessionId);
    batch(() => {
      state$.openSessionIds.set(remainingIds);
      if (state$.selectedSessionId.peek() === sessionId) {
        const nextIndex = Math.min(
          Math.max(closingIndex, 0),
          remainingIds.length - 1
        );
        state$.selectedSessionId.set(
          nextIndex >= 0 ? remainingIds[nextIndex] : undefined
        );
      }
      state$.workbenchesBySessionId[sessionId]?.delete();
    });
  };

  const workbenchFor = (sessionId: string | undefined) => {
    if (!sessionId) {
      return defaultWorkbenchLayout;
    }
    return (
      state$.workbenchesBySessionId[sessionId]?.peek() ?? defaultWorkbenchLayout
    );
  };

  return {
    closeMobileSidebar: () => {
      state$.mobileSidebarOpen.set(false);
    },
    closeSessionTab: removeSession,
    closeSettings: () => {
      state$.settingsOpen.set(false);
    },
    closeWorkbench: (sessionId) => {
      const previous = workbenchFor(sessionId);
      state$.workbenchesBySessionId.assign({
        [sessionId]: {
          ...previous,
          expanded: false,
          open: false,
        },
      });
    },
    reconcileSessions: (sessionIds, defaultSessionId, defaultProjectId) => {
      if (!sessionsInitialized) {
        sessionsInitialized = true;
        batch(() => {
          state$.openSessionIds.set(defaultSessionId ? [defaultSessionId] : []);
          state$.selectedSessionId.set(defaultSessionId);
          if (defaultProjectId) {
            state$.expandedProjects.assign({ [defaultProjectId]: true });
          }
        });
        return;
      }
      const availableIds = new Set(sessionIds);
      const currentOpenIds = state$.openSessionIds.peek();
      const retainedIds = currentOpenIds.filter((id) => availableIds.has(id));
      batch(() => {
        if (!sameIds(currentOpenIds, retainedIds)) {
          state$.openSessionIds.set(retainedIds);
        }
        const selectedSessionId = state$.selectedSessionId.peek();
        if (selectedSessionId && !availableIds.has(selectedSessionId)) {
          state$.selectedSessionId.set(retainedIds[0]);
        }
      });
    },
    removeSession,
    selectSession: (sessionId, projectId) => {
      batch(() => {
        const openSessionIds = state$.openSessionIds.peek();
        if (!openSessionIds.includes(sessionId)) {
          state$.openSessionIds.set([...openSessionIds, sessionId]);
        }
        state$.selectedSessionId.set(sessionId);
        state$.mobileSidebarOpen.set(false);
        if (projectId) {
          state$.expandedProjects.assign({ [projectId]: true });
        }
      });
    },
    selectSurface: (sessionId, surface) => {
      const previous = workbenchFor(sessionId);
      if (surface === "chat") {
        state$.workbenchesBySessionId.assign({
          [sessionId]: {
            ...previous,
            expanded: false,
            open: false,
          },
        });
        return;
      }
      const changingSurface = !previous.open || previous.surface !== surface;
      state$.workbenchesBySessionId.assign({
        [sessionId]: {
          ...previous,
          expanded: changingSurface
            ? surface === "files" || surface === "changes"
            : previous.expanded,
          open: true,
          surface,
        },
      });
    },
    setProjectExpanded: (projectId, expanded) => {
      state$.expandedProjects.assign({ [projectId]: expanded });
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
      } else {
        state$.mobileSidebarOpen.toggle();
      }
    },
    toggleWorkbenchExpanded: (sessionId) => {
      const previous = workbenchFor(sessionId);
      state$.workbenchesBySessionId.assign({
        [sessionId]: {
          ...previous,
          expanded: !previous.expanded,
          open: true,
        },
      });
    },
    workbenchFor,
  };
}
