import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useValue } from "@legendapp/state/react";
import { useCallback } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ComputerFilter } from "@/features/connections/components/computer-filter";
import {
  NewSessionControl,
  type NewSessionProject,
} from "@/features/workspace/components/new-session-control";
import type { HostConnection } from "@/features/workspace/components/status-indicators";
import { WorkspaceProjectRow } from "@/features/workspace/components/workspace-project-row";
import { WorkspaceSessionRow } from "@/features/workspace/components/workspace-session-row";
import {
  useVibePadWorkspaceStore,
  useVibePadWorkspaceUiStore,
} from "@/lib/vibepad-host-context";

interface WorkspaceSidebarProps {
  readonly hideStatusFooter?: boolean;
  readonly hostConnection: HostConnection;
  readonly hostName: string;
  readonly newSessionDisabled: boolean;
  readonly onArchiveSession: (sessionId: string) => Promise<void>;
  readonly onCreateSession: (projectId: string) => Promise<void>;
  readonly onOpenSettings: () => void;
  readonly onRefresh: () => void;
  readonly onRenameSession: (sessionId: string, title: string) => Promise<void>;
  readonly onSelectSession: (sessionId: string) => void;
  readonly projects: readonly NewSessionProject[];
  readonly selectedProjectId: string | undefined;
}

const projectPrefix = "project:";
const sessionPrefix = "session:";
const sidebarRowType = (rowId: string) =>
  rowId.startsWith(projectPrefix) ? "project" : "session";
const sidebarRowKey = (rowId: string) => rowId;

function SidebarListFooter({
  errorMessage,
  loading,
  onRefresh,
  rowCount,
}: {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly onRefresh: () => void;
  readonly rowCount: number;
}) {
  if (loading) {
    return (
      <View className="px-2 py-6">
        <Text className="text-xs" variant="muted">
          Loading chats…
        </Text>
      </View>
    );
  }
  if (errorMessage) {
    return (
      <View className="gap-3 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-3">
        <Text className="text-red-600 text-xs" numberOfLines={3}>
          {errorMessage}
        </Text>
        <Button onPress={onRefresh} size="sm" variant="outline">
          <Text>Retry</Text>
        </Button>
      </View>
    );
  }
  return rowCount === 0 ? (
    <View className="px-2 py-6">
      <Text className="text-xs" variant="muted">
        No chats found.
      </Text>
    </View>
  ) : null;
}

export function WorkspaceSidebar({
  hideStatusFooter = false,
  hostConnection,
  hostName,
  newSessionDisabled,
  onArchiveSession,
  onCreateSession,
  onOpenSettings,
  onRenameSession,
  onSelectSession,
  onRefresh,
  projects,
  selectedProjectId,
}: WorkspaceSidebarProps) {
  const insets = useSafeAreaInsets();
  const workspace = useVibePadWorkspaceStore();
  const workspaceUi = useVibePadWorkspaceUiStore();
  const { errorMessage, loading, rows } = useValue(() => {
    const status = workspace.state$.status.get();
    const projectIds = workspace.state$.projectIds.get();
    const rowIds: string[] = [];
    for (const projectId of projectIds) {
      rowIds.push(`${projectPrefix}${projectId}`);
      if (workspaceUi.state$.expandedProjects[projectId]?.get()) {
        const sessionIds =
          workspace.state$.sessionIdsByProjectId[projectId]?.get() ?? [];
        rowIds.push(
          ...sessionIds.map((sessionId) => `${sessionPrefix}${sessionId}`)
        );
      }
    }
    return {
      errorMessage:
        status === "error" ? workspace.state$.errorMessage.get() : undefined,
      loading: status === "loading",
      rows: rowIds,
    };
  });
  const renderRow = useCallback(
    ({ item }: LegendListRenderItemProps<string>) =>
      item.startsWith(projectPrefix) ? (
        <WorkspaceProjectRow
          hostConnection={hostConnection}
          hostName={hostName}
          newSessionDisabled={newSessionDisabled}
          onCreateSession={onCreateSession}
          projectId={item.slice(projectPrefix.length)}
        />
      ) : (
        <WorkspaceSessionRow
          onArchiveSession={onArchiveSession}
          onRenameSession={onRenameSession}
          onSelectSession={onSelectSession}
          sessionId={item.slice(sessionPrefix.length)}
        />
      ),
    [
      hostConnection,
      hostName,
      newSessionDisabled,
      onArchiveSession,
      onCreateSession,
      onRenameSession,
      onSelectSession,
    ]
  );
  const listFooter = hideStatusFooter ? null : (
    <SidebarListFooter
      errorMessage={errorMessage}
      loading={loading}
      onRefresh={onRefresh}
      rowCount={rows.length}
    />
  );

  return (
    <View className="h-full bg-card" testID="workspace-sidebar">
      <View className="h-12 flex-row items-center gap-2.5 border-border border-b px-3">
        <Text className="flex-1 font-semibold text-base">Chats</Text>
        <Button
          accessibilityLabel="Open settings"
          onPress={onOpenSettings}
          size="icon"
          testID="settings-open"
          variant="ghost"
        >
          <Icon name="settings" size={15} />
        </Button>
      </View>

      <ComputerFilter />

      <View className="px-2 pt-2 pb-1">
        <NewSessionControl
          disabled={newSessionDisabled}
          onCreate={onCreateSession}
          projects={projects}
          selectedProjectId={selectedProjectId}
          triggerVariant="sidebar"
        />
      </View>

      <LegendList
        contentContainerStyle={{
          gap: 2,
          paddingBottom: 12,
          paddingHorizontal: 8,
        }}
        data={rows}
        dataKey="workspace-sidebar"
        estimatedItemSize={24}
        getItemType={sidebarRowType}
        keyExtractor={sidebarRowKey}
        ListFooterComponent={listFooter}
        recycleItems={false}
        renderItem={renderRow}
        style={{ flex: 1 }}
      />

      <View style={{ height: Math.max(insets.bottom, 8) }} />
    </View>
  );
}
