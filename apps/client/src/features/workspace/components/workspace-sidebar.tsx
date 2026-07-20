import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useValue } from "@legendapp/state/react";
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  ConnectionIndicator,
  type HostConnection,
} from "@/features/workspace/components/status-indicators";
import { WorkspaceProjectRow } from "@/features/workspace/components/workspace-project-row";
import { WorkspaceSessionRow } from "@/features/workspace/components/workspace-session-row";
import {
  useVibePadWorkspaceStore,
  useVibePadWorkspaceUiStore,
} from "@/lib/vibepad-host-context";

interface WorkspaceSidebarProps {
  readonly hostConnection: HostConnection;
  readonly hostName: string;
  readonly onArchiveSession: (sessionId: string) => Promise<void>;
  readonly onOpenSettings: () => void;
  readonly onRefresh: () => void;
  readonly onRenameSession: (sessionId: string, title: string) => Promise<void>;
  readonly onSelectSession: (sessionId: string) => void;
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
          Loading projects…
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
        No projects found.
      </Text>
    </View>
  ) : null;
}

export function WorkspaceSidebar({
  hostConnection,
  hostName,
  onArchiveSession,
  onOpenSettings,
  onRenameSession,
  onSelectSession,
  onRefresh,
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
      onArchiveSession,
      onRenameSession,
      onSelectSession,
    ]
  );
  const listHeader = (
    <View className="px-2 pt-2 pb-1">
      <Text
        className="font-medium text-[11px] uppercase tracking-wider"
        variant="muted"
      >
        Workspaces
      </Text>
    </View>
  );
  const listFooter = (
    <SidebarListFooter
      errorMessage={errorMessage}
      loading={loading}
      onRefresh={onRefresh}
      rowCount={rows.length}
    />
  );

  return (
    <View className="h-full bg-card" testID="workspace-sidebar">
      <View className="h-14 flex-row items-center gap-3 border-border border-b px-3">
        <View className="size-7 items-center justify-center rounded-lg bg-foreground">
          <Text className="font-semibold text-background text-sm">V</Text>
        </View>
        <Text className="flex-1 font-semibold text-sm">VibePad</Text>
      </View>

      <View className="px-3 pt-3 pb-2">
        <Pressable
          accessibilityLabel="Search workspaces and sessions"
          className="h-9 flex-row items-center gap-2 rounded-lg bg-muted px-3"
        >
          <Icon className="text-muted-foreground" name="search" size={14} />
          <Text className="text-xs" variant="muted">
            Search
          </Text>
          <Text className="ml-auto text-[10px]" variant="muted">
            ⌘ K
          </Text>
        </Pressable>
      </View>

      <LegendList
        contentContainerStyle={{
          gap: 4,
          paddingBottom: 16,
          paddingHorizontal: 8,
        }}
        data={rows}
        dataKey="workspace-sidebar"
        estimatedItemSize={24}
        getItemType={sidebarRowType}
        keyExtractor={sidebarRowKey}
        ListFooterComponent={listFooter}
        ListHeaderComponent={listHeader}
        recycleItems={false}
        renderItem={renderRow}
        style={{ flex: 1 }}
      />

      <View
        className="border-border border-t p-2"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        <Pressable
          accessibilityLabel="Open settings"
          className="flex-row items-center gap-3 rounded-lg px-2 py-2 active:bg-accent/70"
          onPress={onOpenSettings}
          testID="settings-open"
        >
          <View className="size-7 items-center justify-center rounded-md bg-muted">
            <Text className="font-semibold text-xs">
              {hostName.slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text className="font-medium text-xs">{hostName}</Text>
              <ConnectionIndicator connection={hostConnection} />
            </View>
            <Text className="text-[10px]" variant="muted">
              VibePad host
            </Text>
          </View>
          <Icon className="text-muted-foreground" name="settings" size={15} />
        </Pressable>
      </View>
    </View>
  );
}
