import { useValue } from "@legendapp/state/react";
import type { TriggerRef } from "@rn-primitives/popover";
import {
  type ComponentProps,
  type ComponentType,
  useCallback,
  useRef,
  useState,
} from "react";
import { Platform, Pressable, type PressableProps, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  HarnessIcon,
  harnessLabel,
} from "@/features/harness/components/harness-icon";
import { SessionActionsMenu } from "@/features/workspace/components/session-actions-menu";
import { SessionTitle } from "@/features/workspace/components/session-title";
import { SessionStateIndicator } from "@/features/workspace/components/status-indicators";
import {
  sessionStateLabel,
  stateForSession,
} from "@/features/workspace/components/workspace-row-state";
import { cn } from "@/lib/utils";
import {
  useVibePadWorkspaceStore,
  useVibePadWorkspaceUiStore,
} from "@/lib/vibepad-host-context";

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
      className="w-20 items-center justify-center bg-destructive active:bg-destructive/90"
      disabled={archiving}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      onPress={archive}
      testID={`session-${sessionId}-swipe-archive`}
    >
      <Icon className="text-white" name="archive" size={15} />
      <Text className="mt-1 text-destructive-foreground" variant="metadata">
        {archiveActionLabel(archiving, archiveFailed)}
      </Text>
    </Pressable>
  );
}

export function WorkspaceSessionRow({
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
    <View className="ml-8 border-border border-l pl-2">
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
            "h-11 flex-row items-center gap-2 rounded-md bg-card px-2 active:bg-accent/70",
            selected && "bg-accent"
          )}
          testID={`session-${session.id}`}
        >
          <ContextPressable
            accessibilityLabel={`Open session ${session.title}, ${sessionStateLabel[state]}`}
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
            className="size-11 shrink-0 items-center justify-center"
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
