import type { TriggerRef } from "@rn-primitives/popover";
import {
  type ComponentProps,
  type ComponentType,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Platform,
  Pressable,
  type PressableProps,
  ScrollView,
  View,
} from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

export interface WorkspaceSession {
  readonly harnessId: import("@vibepad/protocol/provider").HarnessId;
  readonly id: string;
  readonly state: SessionIndicatorState;
  readonly title: string;
}

export interface WorkspaceItem {
  readonly connection: HostConnection;
  readonly defaultExpanded?: boolean;
  readonly harnessId: import("@vibepad/protocol/provider").HarnessId;
  readonly host: string;
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly sessions: readonly WorkspaceSession[];
}

interface WorkspaceSidebarProps {
  readonly errorMessage?: string;
  readonly hostConnection: HostConnection;
  readonly hostName: string;
  readonly loading: boolean;
  readonly onArchiveSession: (sessionId: string) => Promise<void>;
  readonly onOpenSettings: () => void;
  readonly onRefresh: () => void;
  readonly onRenameSession: (sessionId: string, title: string) => Promise<void>;
  readonly onSelectSession: (sessionId: string) => void;
  readonly selectedSessionId: string | undefined;
  readonly workspaces: readonly WorkspaceItem[];
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

function aggregateState(
  sessions: readonly WorkspaceSession[]
): SessionIndicatorState {
  if (sessions.some((session) => session.state === "permission")) {
    return "permission";
  }
  if (sessions.some((session) => session.state === "question")) {
    return "question";
  }
  if (sessions.some((session) => session.state === "retrying")) {
    return "retrying";
  }
  if (sessions.some((session) => session.state === "working")) {
    return "working";
  }
  return "idle";
}

function SessionRow({
  onArchiveSession,
  onRenameSession,
  onSelectSession,
  selected,
  session,
}: {
  readonly onArchiveSession: (sessionId: string) => Promise<void>;
  readonly onRenameSession: (sessionId: string, title: string) => Promise<void>;
  readonly onSelectSession: (sessionId: string) => void;
  readonly selected: boolean;
  readonly session: WorkspaceSession;
}) {
  const actionsTriggerRef = useRef<TriggerRef>(null);
  const [archiveFailed, setArchiveFailed] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const selectSession = useCallback(() => {
    onSelectSession(session.id);
  }, [onSelectSession, session.id]);
  const openActions = useCallback(() => {
    actionsTriggerRef.current?.open();
  }, []);
  const openContextActions = useCallback((event: ContextMenuEvent) => {
    event.preventDefault();
    actionsTriggerRef.current?.open();
  }, []);
  const renameSession = useCallback(
    (title: string) => onRenameSession(session.id, title),
    [onRenameSession, session.id]
  );
  const archiveSession = useCallback(
    () => onArchiveSession(session.id),
    [onArchiveSession, session.id]
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
        sessionId={session.id}
        title={session.title}
        visible={swipeOpen}
      />
    ),
    [
      archiveFailed,
      archiveFromSwipe,
      archiving,
      session.id,
      session.title,
      swipeOpen,
    ]
  );

  return (
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
          accessibilityLabel={`Open session ${session.title}, ${stateLabel[session.state]}`}
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
          {session.state === "idle" ? null : (
            <SessionStateIndicator state={session.state} />
          )}
          <View
            accessibilityElementsHidden={
              !(selected && session.state === "idle")
            }
            aria-hidden={!(selected && session.state === "idle")}
            className={cn(
              "absolute",
              selected && session.state === "idle" ? "opacity-100" : "opacity-0"
            )}
            importantForAccessibility={
              selected && session.state === "idle"
                ? "auto"
                : "no-hide-descendants"
            }
            style={{
              pointerEvents:
                selected && session.state === "idle" ? "auto" : "none",
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
  );
}

function WorkspaceGroup({
  onArchiveSession,
  onRenameSession,
  onSelectSession,
  selectedSessionId,
  workspace,
}: {
  readonly onArchiveSession: (sessionId: string) => Promise<void>;
  readonly onRenameSession: (sessionId: string, title: string) => Promise<void>;
  readonly onSelectSession: (sessionId: string) => void;
  readonly selectedSessionId: string | undefined;
  readonly workspace: WorkspaceItem;
}) {
  const [open, setOpen] = useState(workspace.defaultExpanded ?? false);
  const containsSelectedSession = workspace.sessions.some(
    (session) => session.id === selectedSessionId
  );

  useEffect(() => {
    if (containsSelectedSession) {
      setOpen(true);
    }
  }, [containsSelectedSession]);

  const state = aggregateState(workspace.sessions);
  const showAggregateState = !open && state !== "idle";

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>
        <Pressable
          accessibilityLabel={`${open ? "Collapse" : "Expand"} ${workspace.name}`}
          className="group flex-row items-center gap-2 rounded-lg px-2 py-2 active:bg-accent/70"
          testID={`workspace-${workspace.id}-toggle`}
        >
          <Icon
            className="text-muted-foreground"
            name={open ? "chevron-down" : "chevron-right"}
            size={14}
          />
          <Icon className="text-foreground" name="folder" size={15} />
          <Text
            className="min-w-0 flex-1 font-medium text-sm"
            numberOfLines={1}
          >
            {workspace.name}
          </Text>
          <Text className="max-w-24 text-xs" numberOfLines={1} variant="muted">
            {workspace.host}
          </Text>
          <View
            className="w-4 shrink-0 items-center"
            testID={
              workspace.connection === "offline" || !showAggregateState
                ? `workspace-${workspace.id}-connection`
                : `workspace-${workspace.id}-state`
            }
          >
            {workspace.connection === "offline" || !showAggregateState ? (
              <ConnectionIndicator connection={workspace.connection} />
            ) : (
              <SessionStateIndicator state={state} />
            )}
          </View>
        </Pressable>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <View className="ml-[31px] border-border border-l pl-2">
          {workspace.sessions.map((session) => (
            <SessionRow
              key={session.id}
              onArchiveSession={onArchiveSession}
              onRenameSession={onRenameSession}
              onSelectSession={onSelectSession}
              selected={session.id === selectedSessionId}
              session={session}
            />
          ))}
        </View>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function WorkspaceSidebar({
  errorMessage,
  hostConnection,
  hostName,
  loading,
  onArchiveSession,
  onOpenSettings,
  onRenameSession,
  onSelectSession,
  onRefresh,
  selectedSessionId,
  workspaces,
}: WorkspaceSidebarProps) {
  const insets = useSafeAreaInsets();

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

      <ScrollView
        className="flex-1 px-2"
        contentContainerClassName="gap-1 pb-4"
      >
        <View className="px-2 pt-2 pb-1">
          <Text
            className="font-medium text-[11px] uppercase tracking-wider"
            variant="muted"
          >
            Workspaces
          </Text>
        </View>
        {workspaces.map((workspace) => (
          <WorkspaceGroup
            key={workspace.id}
            onArchiveSession={onArchiveSession}
            onRenameSession={onRenameSession}
            onSelectSession={onSelectSession}
            selectedSessionId={selectedSessionId}
            workspace={workspace}
          />
        ))}
        {loading ? (
          <View className="px-2 py-6">
            <Text className="text-xs" variant="muted">
              Loading projects…
            </Text>
          </View>
        ) : null}
        {errorMessage ? (
          <View className="gap-3 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-3">
            <Text className="text-red-600 text-xs" numberOfLines={3}>
              {errorMessage}
            </Text>
            <Button onPress={onRefresh} size="sm" variant="outline">
              <Text>Retry</Text>
            </Button>
          </View>
        ) : null}
        {!(loading || errorMessage) && workspaces.length === 0 ? (
          <View className="px-2 py-6">
            <Text className="text-xs" variant="muted">
              No projects found.
            </Text>
          </View>
        ) : null}
      </ScrollView>

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
