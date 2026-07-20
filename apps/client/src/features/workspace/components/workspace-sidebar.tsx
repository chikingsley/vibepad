import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useValue } from "@legendapp/state/react";
import type { TriggerRef } from "@rn-primitives/popover";
import type { SessionSummary } from "@vibepad/protocol/provider";
import {
  type ComponentProps,
  type ComponentType,
  useCallback,
  useRef,
  useState,
} from "react";
import { Platform, Pressable, type PressableProps, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  HarnessIcon,
  harnessLabel,
} from "@/features/harness/components/harness-icon";
import { SessionActionsMenu } from "@/features/workspace/components/session-actions-menu";
import { SessionTitle } from "@/features/workspace/components/session-title";
import {
  ConnectionIndicator,
  type HostConnection,
  type SessionIndicatorState,
  SessionStateIndicator,
} from "@/features/workspace/components/status-indicators";
import { cn } from "@/lib/utils";
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

const stateLabel: Record<SessionIndicatorState, string> = {
  idle: "idle",
  permission: "waiting for permission",
  question: "waiting for an answer",
  retrying: "retrying",
  working: "working",
};

interface ContextMenuEvent {
  readonly preventDefault: () => void;
}

const ContextPressable = Pressable as ComponentType<
  PressableProps & {
    readonly onContextMenu?: (event: ContextMenuEvent) => void;
  }
>;

const archiveActionLabel = (archiving: boolean, archiveFailed: boolean) => {
  if (archiving) {
    return "Archiving…";
  }
  return archiveFailed ? "Retry" : "Archive";
};

const stateForSession = (session: SessionSummary): SessionIndicatorState => {
  if (session.pendingInput) {
    return session.pendingInput;
  }
  if (session.activity === "busy") {
    return "working";
  }
  if (session.activity === "retry") {
    return "retrying";
  }
  return "idle";
};

const aggregateState = (
  sessions: readonly SessionSummary[]
): SessionIndicatorState => {
  const states = sessions.map(stateForSession);
  if (states.includes("permission")) {
    return "permission";
  }
  if (states.includes("question")) {
    return "question";
  }
  if (states.includes("retrying")) {
    return "retrying";
  }
  return states.includes("working") ? "working" : "idle";
};

function ArchiveSwipeAction({
  archiveFailed,
  archiving,
  close,
  onArchive,
  sessionId,
  title,
  visible,
}: {
  readonly archiveFailed: boolean;
  readonly archiving: boolean;
  readonly close: () => void;
  readonly onArchive: (close: () => void) => Promise<void>;
  readonly sessionId: string;
  readonly title: string;
  readonly visible: boolean;
}) {
  const archive = useCallback(() => {
    onArchive(close).catch(() => undefined);
  }, [close, onArchive]);

  return (
    <Pressable
      accessibilityElementsHidden={!visible}
      accessibilityLabel={`Archive ${title}`}
      aria-hidden={!visible}
      className="w-20 items-center justify-center bg-red-500 active:bg-red-600"
      disabled={archiving}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      onPress={archive}
      testID={`session-${sessionId}-swipe-archive`}
    >
      <Icon className="text-white" name="archive" size={15} />
      <Text className="mt-0.5 text-[10px] text-white">
        {archiveActionLabel(archiving, archiveFailed)}
      </Text>
    </Pressable>
  );
}

function SessionRow({
  onArchiveSession,
  onRenameSession,
  onSelectSession,
  sessionId,
}: {
  readonly onArchiveSession: (sessionId: string) => Promise<void>;
  readonly onRenameSession: (sessionId: string, title: string) => Promise<void>;
  readonly onSelectSession: (sessionId: string) => void;
  readonly sessionId: string;
}) {
  const workspace = useVibePadWorkspaceStore();
  const workspaceUi = useVibePadWorkspaceUiStore();
  const session = useValue(() => workspace.session$(sessionId)?.get());
  const selected = useValue(
    () => workspaceUi.state$.selectedSessionId.get() === sessionId
  );
  const actionsTriggerRef = useRef<TriggerRef>(null);
  const [archiveFailed, setArchiveFailed] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const selectSession = useCallback(() => {
    onSelectSession(sessionId);
  }, [onSelectSession, sessionId]);
  const openActions = useCallback(() => {
    actionsTriggerRef.current?.open();
  }, []);
  const openContextActions = useCallback((event: ContextMenuEvent) => {
    event.preventDefault();
    actionsTriggerRef.current?.open();
  }, []);
  const renameSession = useCallback(
    (title: string) => onRenameSession(sessionId, title),
    [onRenameSession, sessionId]
  );
  const archiveSession = useCallback(
    () => onArchiveSession(sessionId),
    [onArchiveSession, sessionId]
  );
  const archiveFromSwipe = useCallback(
    async (close: () => void) => {
      if (archiving) {
        return;
      }
      setArchiveFailed(false);
      setArchiving(true);
      try {
        await archiveSession();
        close();
      } catch {
        setArchiveFailed(true);
      } finally {
        setArchiving(false);
      }
    },
    [archiveSession, archiving]
  );
  const hideSwipeAction = useCallback(() => {
    setSwipeOpen(false);
  }, []);
  const showSwipeAction = useCallback(() => {
    setSwipeOpen(true);
  }, []);
  const renderRightActions = useCallback<
    NonNullable<
      ComponentProps<typeof ReanimatedSwipeable>["renderRightActions"]
    >
  >(
    (_progress, _translation, methods) => (
      <ArchiveSwipeAction
        archiveFailed={archiveFailed}
        archiving={archiving}
        close={methods.close}
        onArchive={archiveFromSwipe}
        sessionId={sessionId}
        title={session?.title ?? "session"}
        visible={swipeOpen}
      />
    ),
    [
      archiveFailed,
      archiveFromSwipe,
      archiving,
      session?.title,
      sessionId,
      swipeOpen,
    ]
  );

  if (!session) {
    return null;
  }
  const state = stateForSession(session);

  return (
    <View className="ml-[31px] border-border border-l pl-2">
      <ReanimatedSwipeable
        enableTrackpadTwoFingerGesture
        friction={1.5}
        onSwipeableWillClose={hideSwipeAction}
        onSwipeableWillOpen={showSwipeAction}
        overshootRight={false}
        renderRightActions={renderRightActions}
        rightThreshold={36}
        testID={`session-${session.id}-swipeable`}
      >
        <View
          className={cn(
            "mb-0.5 h-9 flex-row items-center gap-1.5 rounded-md bg-card px-2 active:bg-accent/70",
            selected && "bg-accent"
          )}
          testID={`session-${session.id}`}
        >
          <ContextPressable
            accessibilityLabel={`Open session ${session.title}, ${stateLabel[state]}`}
            className="min-w-0 flex-1 flex-row items-center gap-2"
            delayLongPress={320}
            onLongPress={openActions}
            onPress={selectSession}
            {...(Platform.OS === "web"
              ? { onContextMenu: openContextActions }
              : {})}
          >
            <HarnessIcon
              accessibilityLabel={harnessLabel(session.harnessId)}
              className="text-muted-foreground"
              harnessId={session.harnessId}
              size={22}
            />
            <SessionTitle title={session.title} />
          </ContextPressable>
          <View
            className="size-7 shrink-0 items-center justify-center"
            testID={`session-${session.id}-state`}
          >
            {state === "idle" ? null : <SessionStateIndicator state={state} />}
            <View
              accessibilityElementsHidden={!(selected && state === "idle")}
              aria-hidden={!(selected && state === "idle")}
              className={cn(
                "absolute",
                selected && state === "idle" ? "opacity-100" : "opacity-0"
              )}
              importantForAccessibility={
                selected && state === "idle" ? "auto" : "no-hide-descendants"
              }
              style={{
                pointerEvents: selected && state === "idle" ? "auto" : "none",
              }}
            >
              <SessionActionsMenu
                onArchive={archiveSession}
                onRename={renameSession}
                selected={selected}
                sessionId={session.id}
                title={session.title}
                triggerRef={actionsTriggerRef}
              />
            </View>
          </View>
        </View>
      </ReanimatedSwipeable>
    </View>
  );
}

function ProjectRow({
  hostConnection,
  hostName,
  projectId,
}: {
  readonly hostConnection: HostConnection;
  readonly hostName: string;
  readonly projectId: string;
}) {
  const workspace = useVibePadWorkspaceStore();
  const workspaceUi = useVibePadWorkspaceUiStore();
  const { open, project, sessions } = useValue(() => {
    const projectRecord = workspace.project$(projectId)?.get();
    const sessionIds = workspace.projectSessionIds$(projectId)?.get() ?? [];
    return {
      open: workspaceUi.state$.expandedProjects[projectId]?.get() ?? false,
      project: projectRecord,
      sessions: sessionIds.flatMap((sessionId) => {
        const session = workspace.session$(sessionId)?.get();
        return session ? [session] : [];
      }),
    };
  });
  const toggle = useCallback(() => {
    workspaceUi.setProjectExpanded(projectId, !open);
  }, [open, projectId, workspaceUi]);

  if (!project) {
    return null;
  }
  const state = aggregateState(sessions);
  const showAggregateState = !open && state !== "idle";

  return (
    <Pressable
      accessibilityLabel={`${open ? "Collapse" : "Expand"} ${project.name}`}
      className="flex-row items-center gap-2 rounded-lg px-2 py-2 active:bg-accent/70"
      onPress={toggle}
      testID={`workspace-${project.id}-toggle`}
    >
      <Icon
        className="text-muted-foreground"
        name={open ? "chevron-down" : "chevron-right"}
        size={14}
      />
      <Icon className="text-foreground" name="folder" size={15} />
      <Text className="min-w-0 flex-1 font-medium text-sm" numberOfLines={1}>
        {project.name}
      </Text>
      <Text className="max-w-24 text-xs" numberOfLines={1} variant="muted">
        {hostName}
      </Text>
      <View
        className="w-4 shrink-0 items-center"
        testID={
          hostConnection === "offline" || !showAggregateState
            ? `workspace-${project.id}-connection`
            : `workspace-${project.id}-state`
        }
      >
        {hostConnection === "offline" || !showAggregateState ? (
          <ConnectionIndicator connection={hostConnection} />
        ) : (
          <SessionStateIndicator state={state} />
        )}
      </View>
    </Pressable>
  );
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
        <ProjectRow
          hostConnection={hostConnection}
          hostName={hostName}
          projectId={item.slice(projectPrefix.length)}
        />
      ) : (
        <SessionRow
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
        estimatedItemSize={32}
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
