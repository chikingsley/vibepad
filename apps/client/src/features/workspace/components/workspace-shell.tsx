import { useValue } from "@legendapp/state/react";
import { type ReactNode, useCallback, useEffect } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import Animated, {
  FadeInLeft,
  FadeOutLeft,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { HostConnectionRecovery } from "@/features/connections/components/host-connection-recovery";
import { reportComputerConnection } from "@/features/connections/state/computer-connections";
import { SettingsDialog } from "@/features/settings/components/settings-dialog";
import type { SessionSurface } from "@/features/workspace/components/session-workbench-controls";
import { WorkspaceHeader } from "@/features/workspace/components/workspace-header";
import { WorkspaceSessionCanvas } from "@/features/workspace/components/workspace-session-canvas";
import { WorkspaceSidebar } from "@/features/workspace/components/workspace-sidebar";
import { defaultWorkbenchLayout } from "@/features/workspace/state/workspace-ui-persistence";
import {
  useProjectServices,
  useWorkspaceLifecycle,
} from "@/lib/use-host-workspace";
import {
  useVibePadHost,
  useVibePadWorkspaceStore,
  useVibePadWorkspaceUiStore,
} from "@/lib/vibepad-host-context";

const regularSidebarBreakpoint = 760;

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
        width: open ? 284 : 0,
      }}
    >
      <View className="h-full" style={{ width: 284 }}>
        {children}
      </View>
    </Animated.View>
  );
}

export function WorkspaceShell() {
  const host = useVibePadHost();
  const workspace = useVibePadWorkspaceStore();
  const workspaceUi = useVibePadWorkspaceUiStore();
  const {
    closeMobileSidebar,
    closeSettings,
    reconcileSessions,
    removeSession: removeUiSession,
    selectSession: selectWorkspaceSession,
    selectSurface,
    showSettings,
    toggleSidebar: toggleWorkspaceSidebar,
  } = workspaceUi;
  const { width } = useWindowDimensions();
  const regularLayout = width >= regularSidebarBreakpoint;
  const {
    desktopSidebarOpen,
    mobileSidebarOpen,
    selectedSessionId,
    settingsOpen,
    settingsPage,
  } = useValue(() => ({
    desktopSidebarOpen: workspaceUi.state$.desktopSidebarOpen.get(),
    mobileSidebarOpen: workspaceUi.state$.mobileSidebarOpen.get(),
    selectedSessionId: workspaceUi.state$.selectedSessionId.get(),
    settingsOpen: workspaceUi.state$.settingsOpen.get(),
    settingsPage: workspaceUi.state$.settingsPage.get(),
  }));
  const { refresh, removeSession, upsertSession } = useWorkspaceLifecycle();
  const {
    errorMessage,
    health,
    projects,
    selectedProject,
    selectedSession,
    selectedWorkbench,
    sessionIds,
    workspaceStatus,
  } = useValue(() => {
    const status = workspace.state$.status.get();
    const healthRecord = workspace.state$.health.get();
    const projectRecords = workspace.state$.projectIds
      .get()
      .flatMap((projectId) => {
        const project = workspace.project$(projectId)?.get();
        return project ? [project] : [];
      });
    const selectedSessionRecord = selectedSessionId
      ? workspace.session$(selectedSessionId)?.get()
      : undefined;
    return {
      errorMessage:
        status === "error" ? workspace.state$.errorMessage.get() : undefined,
      health: healthRecord,
      projects: projectRecords,
      selectedProject: selectedSessionRecord
        ? workspace.project$(selectedSessionRecord.projectId)?.get()
        : undefined,
      selectedSession: selectedSessionRecord,
      selectedWorkbench: selectedSessionId
        ? (workspaceUi.state$.workbenchesBySessionId[
            selectedSessionId
          ]?.get() ?? defaultWorkbenchLayout)
        : defaultWorkbenchLayout,
      sessionIds: workspace.state$.sessionIds.get(),
      workspaceStatus: status,
    };
  });
  const hostName = health?.host.id ?? host.hostId;
  const hostConnection = health?.host.healthy ? "online" : "offline";
  const providerHealthy = health?.provider.healthy ?? false;
  const connectionRecovery = workspaceStatus === "error" && !health;

  const hostHealthy = health?.host.healthy ?? false;
  useEffect(() => {
    if (workspaceStatus === "loading") {
      reportComputerConnection(host.hostId, "connecting");
      return;
    }
    if (hostHealthy) {
      reportComputerConnection(host.hostId, "connected");
      return;
    }
    if (workspaceStatus === "error") {
      reportComputerConnection(host.hostId, "offline", errorMessage);
      return;
    }
    reportComputerConnection(host.hostId, "attention");
  }, [errorMessage, host.hostId, hostHealthy, workspaceStatus]);

  useEffect(() => {
    if (workspaceStatus !== "ready") {
      return;
    }
    const sessionsById = workspace.state$.sessionsById.peek();
    const defaultSessionId =
      sessionIds.find(
        (sessionId) => sessionsById[sessionId]?.projectId !== "global"
      ) ?? sessionIds[0];
    const defaultSession = defaultSessionId
      ? sessionsById[defaultSessionId]
      : undefined;
    reconcileSessions(
      sessionIds,
      defaultSession?.id,
      defaultSession?.projectId
    );
  }, [reconcileSessions, sessionIds, workspace, workspaceStatus]);

  const servicesState = useProjectServices(selectedProject?.id);
  const selectedSurface: SessionSurface = selectedWorkbench.open
    ? selectedWorkbench.surface
    : "chat";

  const toggleSidebar = useCallback(() => {
    toggleWorkspaceSidebar(regularLayout);
  }, [regularLayout, toggleWorkspaceSidebar]);

  const selectSession = useCallback(
    (sessionId: string) => {
      const session = workspace.state$.sessionsById.peek()[sessionId];
      selectWorkspaceSession(sessionId, session?.projectId);
    },
    [selectWorkspaceSession, workspace]
  );
  const selectSelectedSurface = useCallback(
    (surface: SessionSurface) => {
      if (selectedSessionId) {
        selectSurface(selectedSessionId, surface);
      }
    },
    [selectSurface, selectedSessionId]
  );

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
      removeUiSession(sessionId);
    },
    [host, removeSession, removeUiSession]
  );

  const refreshWorkspace = useCallback(() => {
    refresh().catch(() => undefined);
  }, [refresh]);
  const openSettings = useCallback(() => {
    showSettings("connections");
  }, [showSettings]);
  const sidebar = (
    <WorkspaceSidebar
      hideStatusFooter={connectionRecovery}
      hostConnection={hostConnection}
      hostName={hostName}
      newSessionDisabled={
        workspaceStatus !== "ready" ||
        hostConnection === "offline" ||
        projects.length === 0
      }
      onArchiveSession={archiveSession}
      onCreateSession={createSession}
      onOpenSettings={openSettings}
      onRefresh={refreshWorkspace}
      onRenameSession={renameSession}
      onSelectSession={selectSession}
      projects={projects}
      selectedProjectId={selectedProject?.id}
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
            onSelectSurface={selectSelectedSurface}
            onToggleSidebar={toggleSidebar}
            projectName={selectedProject?.name}
            providerHealthy={providerHealthy}
            selectedSessionId={selectedSessionId}
            selectedSurface={selectedSurface}
            services={servicesState.data}
            servicesLoading={servicesState.status === "loading"}
            sessionTitle={selectedSession?.title}
          />
          {connectionRecovery && errorMessage ? (
            <HostConnectionRecovery
              errorMessage={errorMessage}
              hostId={host.hostId}
              hostName={hostName}
              onOpenConnections={openSettings}
              onRetry={refreshWorkspace}
            />
          ) : (
            <WorkspaceSessionCanvas
              active
              errorMessage={errorMessage}
              hostName={hostName}
              key={selectedSessionId ?? "empty"}
              loading={workspaceStatus === "loading"}
              sessionId={selectedSessionId}
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
          onClose={closeSettings}
          onSelectPage={showSettings}
          page={settingsPage}
        />
      ) : null}
    </SafeAreaView>
  );
}
