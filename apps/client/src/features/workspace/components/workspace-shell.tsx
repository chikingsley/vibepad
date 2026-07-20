import type {
  ProjectSummary,
  SessionSummary,
} from "@vibepad/protocol/provider";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import Animated, {
  FadeInLeft,
  FadeOutLeft,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  SettingsDialog,
  type SettingsPage,
} from "@/features/settings/components/settings-dialog";
import {
  SessionCanvas,
  type SessionWorkbenchLayout,
} from "@/features/workspace/components/session-canvas";
import type { SessionSurface } from "@/features/workspace/components/session-workbench-controls";
import { WorkspaceHeader } from "@/features/workspace/components/workspace-header";
import {
  type WorkspaceItem,
  WorkspaceSidebar,
} from "@/features/workspace/components/workspace-sidebar";
import { useHostWorkspace, useProjectServices } from "@/lib/use-host-workspace";
import { useVibePadHost } from "@/lib/vibepad-host-context";

const regularSidebarBreakpoint = 760;
const emptyProjects: readonly ProjectSummary[] = [];
const emptySessions: readonly SessionSummary[] = [];
const defaultWorkbenchLayout: SessionWorkbenchLayout = {
  expanded: false,
  open: false,
  surface: "changes",
};

const sessionIndicatorState = (session: SessionSummary) => {
  if (session.pendingInput) {
    return session.pendingInput;
  }
  if (session.activity === "busy") {
    return "working" as const;
  }
  if (session.activity === "retry") {
    return "retrying" as const;
  }
  return "idle" as const;
};

const buildWorkspaceItems = (
  projects: readonly ProjectSummary[],
  sessions: readonly SessionSummary[],
  hostName: string,
  connection: "offline" | "online",
  selectedSessionId: string | undefined
): readonly WorkspaceItem[] =>
  projects.map((project) => ({
    connection,
    defaultExpanded: sessions.some(
      (session) =>
        session.id === selectedSessionId && session.projectId === project.id
    ),
    harnessId: project.harnessId,
    host: hostName,
    id: project.id,
    name: project.name,
    path: project.path,
    sessions: sessions
      .filter((session) => session.projectId === project.id)
      .map((session) => ({
        harnessId: session.harnessId,
        id: session.id,
        state: sessionIndicatorState(session),
        title: session.title,
      })),
  }));

const layoutForSession = (
  layouts: Readonly<Record<string, SessionWorkbenchLayout>>,
  sessionId: string | undefined
) =>
  sessionId
    ? (layouts[sessionId] ?? defaultWorkbenchLayout)
    : defaultWorkbenchLayout;

function DesktopSidebar({
  children,
  open,
}: {
  readonly children: ReactNode;
  readonly open: boolean;
}) {
  return (
    <Animated.View
      accessibilityElementsHidden={!open}
      aria-hidden={!open}
      className="overflow-hidden border-border"
      importantForAccessibility={open ? "auto" : "no-hide-descendants"}
      layout={LinearTransition.duration(180).reduceMotion(ReduceMotion.System)}
      style={{
        borderRightWidth: open ? 1 : 0,
        width: open ? 288 : 0,
      }}
    >
      <View className="h-full" style={{ width: 288 }}>
        {children}
      </View>
    </Animated.View>
  );
}

export function WorkspaceShell() {
  const host = useVibePadHost();
  const { width } = useWindowDimensions();
  const regularLayout = width >= regularSidebarBreakpoint;
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("timeline");
  const tabsInitialized = useRef(false);
  const [openSessionIds, setOpenSessionIds] = useState<readonly string[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [workbenchLayouts, setWorkbenchLayouts] = useState<
    Record<string, SessionWorkbenchLayout>
  >({});
  const {
    refresh,
    removeSession,
    state: workspaceState,
    upsertSession,
  } = useHostWorkspace();

  const snapshot =
    workspaceState.status === "ready" ? workspaceState.data : undefined;
  const projects = snapshot?.projects ?? emptyProjects;
  const sessions = snapshot?.sessions ?? emptySessions;
  const hostName = snapshot?.health.host.id ?? "home-mac";
  const hostConnection = snapshot?.health.host.healthy ? "online" : "offline";
  const providerHealthy = snapshot?.health.provider.healthy ?? false;
  const providerHealth = snapshot?.health.providers ?? [];

  useEffect(() => {
    if (workspaceState.status !== "ready") {
      return;
    }

    const availableIds = new Set(sessions.map((session) => session.id));
    const defaultSession =
      sessions.find((session) => session.projectId !== "global") ?? sessions[0];
    if (!tabsInitialized.current) {
      tabsInitialized.current = true;
      setOpenSessionIds(defaultSession ? [defaultSession.id] : []);
      setSelectedSessionId(defaultSession?.id);
      return;
    }

    const retainedIds = openSessionIds.filter((id) => availableIds.has(id));
    if (
      retainedIds.length !== openSessionIds.length ||
      retainedIds.some((id, index) => id !== openSessionIds[index])
    ) {
      setOpenSessionIds(retainedIds);
    }
    if (selectedSessionId && !availableIds.has(selectedSessionId)) {
      setSelectedSessionId(retainedIds[0]);
    }
  }, [openSessionIds, selectedSessionId, sessions, workspaceState.status]);

  const selectedSession = sessions.find(
    (session) => session.id === selectedSessionId
  );
  const selectedProject = selectedSession
    ? projects.find((project) => project.id === selectedSession.projectId)
    : undefined;
  const servicesState = useProjectServices(selectedProject?.id);
  const selectedWorkbench = layoutForSession(
    workbenchLayouts,
    selectedSessionId
  );
  const selectedSurface: SessionSurface = selectedWorkbench.open
    ? selectedWorkbench.surface
    : "chat";

  const workspaces = useMemo(
    () =>
      buildWorkspaceItems(
        projects,
        sessions,
        hostName,
        hostConnection,
        selectedSessionId
      ),
    [hostConnection, hostName, projects, selectedSessionId, sessions]
  );

  const openTabs = useMemo(
    () =>
      openSessionIds.flatMap((sessionId) => {
        const session = sessions.find(
          (candidate) => candidate.id === sessionId
        );
        if (!session) {
          return [];
        }
        const project = projects.find(
          (candidate) => candidate.id === session.projectId
        );
        return project ? [{ project, session }] : [];
      }),
    [openSessionIds, projects, sessions]
  );

  const toggleSidebar = useCallback(() => {
    if (regularLayout) {
      setDesktopSidebarOpen((open) => !open);
      return;
    }
    setMobileSidebarOpen((open) => !open);
  }, [regularLayout]);

  const selectSession = useCallback(
    (sessionId: string) => {
      setOpenSessionIds((current) =>
        current.includes(sessionId) ? current : [...current, sessionId]
      );
      setSelectedSessionId(sessionId);
      if (!regularLayout) {
        setMobileSidebarOpen(false);
      }
    },
    [regularLayout]
  );

  const closeSessionTab = useCallback(
    (sessionId: string) => {
      const closingIndex = openSessionIds.indexOf(sessionId);
      const remainingIds = openSessionIds.filter((id) => id !== sessionId);
      setOpenSessionIds(remainingIds);
      if (selectedSessionId === sessionId) {
        const nextIndex = Math.min(
          Math.max(closingIndex, 0),
          remainingIds.length - 1
        );
        setSelectedSessionId(
          nextIndex >= 0 ? remainingIds[nextIndex] : undefined
        );
      }
    },
    [openSessionIds, selectedSessionId]
  );

  const selectSurfaceForSession = useCallback(
    (sessionId: string, surface: SessionSurface) => {
      setWorkbenchLayouts((current) => {
        const previous = current[sessionId] ?? defaultWorkbenchLayout;
        if (surface === "chat") {
          return {
            ...current,
            [sessionId]: { ...previous, expanded: false, open: false },
          };
        }
        const changingSurface = !previous.open || previous.surface !== surface;
        const expanded = changingSurface
          ? surface === "files" || surface === "changes"
          : previous.expanded;
        return {
          ...current,
          [sessionId]: { ...previous, expanded, open: true, surface },
        };
      });
    },
    []
  );
  const selectSelectedSurface = useCallback(
    (surface: SessionSurface) => {
      if (selectedSessionId) {
        selectSurfaceForSession(selectedSessionId, surface);
      }
    },
    [selectSurfaceForSession, selectedSessionId]
  );
  const closeWorkbench = useCallback((sessionId: string) => {
    setWorkbenchLayouts((current) => {
      const previous = current[sessionId] ?? defaultWorkbenchLayout;
      return {
        ...current,
        [sessionId]: { ...previous, expanded: false, open: false },
      };
    });
  }, []);
  const toggleWorkbenchExpanded = useCallback((sessionId: string) => {
    setWorkbenchLayouts((current) => {
      const previous = current[sessionId] ?? defaultWorkbenchLayout;
      return {
        ...current,
        [sessionId]: {
          ...previous,
          expanded: !previous.expanded,
          open: true,
        },
      };
    });
  }, []);

  const createSession = useCallback(
    async (projectId: string) => {
      const created = await host.createSession(projectId);
      upsertSession(created);
      selectSession(created.id);
    },
    [host, selectSession, upsertSession]
  );

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      const updated = await host.renameSession(sessionId, title);
      upsertSession(updated);
    },
    [host, upsertSession]
  );

  const archiveSession = useCallback(
    async (sessionId: string) => {
      await host.archiveSession(sessionId);
      removeSession(sessionId);
      closeSessionTab(sessionId);
      setWorkbenchLayouts((current) => {
        const { [sessionId]: _removed, ...remaining } = current;
        return remaining;
      });
    },
    [closeSessionTab, host, removeSession]
  );

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);
  const refreshWorkspace = useCallback(() => {
    refresh().catch(() => undefined);
  }, [refresh]);
  const openSettings = useCallback(() => {
    setSettingsPage("timeline");
    setSettingsOpen(true);
  }, []);
  const openConnectionSettings = useCallback(() => {
    setSettingsPage("connections");
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const sidebar = (
    <WorkspaceSidebar
      {...(workspaceState.status === "error"
        ? { errorMessage: workspaceState.message }
        : {})}
      hostConnection={hostConnection}
      hostName={hostName}
      loading={workspaceState.status === "loading"}
      onArchiveSession={archiveSession}
      onOpenSettings={openSettings}
      onRefresh={refreshWorkspace}
      onRenameSession={renameSession}
      onSelectSession={selectSession}
      selectedSessionId={selectedSessionId}
      workspaces={workspaces}
    />
  );

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["left", "right", "top"]}
    >
      <Animated.View
        className="flex-1 flex-row border-border border-t"
        layout={LinearTransition.reduceMotion(ReduceMotion.System)}
        style={{ flex: 1, flexDirection: "row" }}
      >
        {regularLayout ? (
          <DesktopSidebar open={desktopSidebarOpen}>{sidebar}</DesktopSidebar>
        ) : null}

        <View className="min-w-0 flex-1">
          <WorkspaceHeader
            hostConnection={hostConnection}
            hostName={hostName}
            hostUrl={host.baseUrl}
            newSessionDisabled={
              workspaceState.status !== "ready" ||
              hostConnection === "offline" ||
              projects.length === 0
            }
            onAddConnection={openConnectionSettings}
            onCloseTab={closeSessionTab}
            onCreateSession={createSession}
            onSelectSurface={selectSelectedSurface}
            onSelectTab={selectSession}
            onToggleSidebar={toggleSidebar}
            openTabs={openTabs}
            projects={projects}
            providerHealthy={providerHealthy}
            providers={providerHealth}
            selectedProjectId={selectedProject?.id}
            selectedSessionId={selectedSessionId}
            selectedSurface={selectedSurface}
            services={servicesState.data}
            servicesLoading={servicesState.status === "loading"}
          />
          {openTabs.length > 0 ? (
            openTabs.map(({ project, session }) => (
              <View
                className="min-h-0 flex-1"
                key={session.id}
                style={{
                  display: session.id === selectedSessionId ? "flex" : "none",
                }}
              >
                <SessionCanvas
                  active={session.id === selectedSessionId}
                  errorMessage={
                    workspaceState.status === "error"
                      ? workspaceState.message
                      : undefined
                  }
                  hostName={hostName}
                  loading={workspaceState.status === "loading"}
                  onCloseWorkbench={closeWorkbench}
                  onSessionChange={upsertSession}
                  onToggleWorkbenchExpanded={toggleWorkbenchExpanded}
                  project={project}
                  session={session}
                  workbench={layoutForSession(workbenchLayouts, session.id)}
                />
              </View>
            ))
          ) : (
            <SessionCanvas
              active
              errorMessage={
                workspaceState.status === "error"
                  ? workspaceState.message
                  : undefined
              }
              hostName={hostName}
              loading={workspaceState.status === "loading"}
              onCloseWorkbench={closeWorkbench}
              onSessionChange={upsertSession}
              onToggleWorkbenchExpanded={toggleWorkbenchExpanded}
              project={selectedProject}
              session={selectedSession}
              workbench={selectedWorkbench}
            />
          )}
        </View>

        {!regularLayout && mobileSidebarOpen ? (
          <View className="absolute inset-0 z-50 flex-row">
            <Animated.View
              className="w-[86%] max-w-80 border-border border-r shadow-black/20 shadow-xl"
              entering={FadeInLeft.duration(180).reduceMotion(
                ReduceMotion.System
              )}
              exiting={FadeOutLeft.duration(160).reduceMotion(
                ReduceMotion.System
              )}
              style={{ maxWidth: 320, width: "86%" }}
            >
              {sidebar}
            </Animated.View>
            <Pressable
              accessibilityLabel="Close sidebar"
              className="flex-1 bg-black/25"
              onPress={closeMobileSidebar}
              testID="sidebar-backdrop"
            />
          </View>
        ) : null}
      </Animated.View>
      {settingsOpen ? (
        <SettingsDialog
          hostName={hostName}
          hostUrl={host.baseUrl}
          initialPage={settingsPage}
          onClose={closeSettings}
        />
      ) : null}
    </SafeAreaView>
  );
}
