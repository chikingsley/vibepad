import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useValue } from "@legendapp/state/react";
import type { SessionSummary } from "@vibepad/protocol/provider";
import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  HarnessIcon,
  harnessLabel,
} from "@/features/harness/components/harness-icon";
import { SessionTitle } from "@/features/workspace/components/session-title";
import { SessionStateIndicator } from "@/features/workspace/components/status-indicators";
import { cn } from "@/lib/utils";
import {
  useVibePadWorkspaceStore,
  useVibePadWorkspaceUiStore,
} from "@/lib/vibepad-host-context";

const stateForSession = (session: SessionSummary) => {
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

function SessionTab({
  onClose,
  onSelect,
  sessionId,
}: {
  readonly onClose: (sessionId: string) => void;
  readonly onSelect: (sessionId: string) => void;
  readonly sessionId: string;
}) {
  const workspace = useVibePadWorkspaceStore();
  const workspaceUi = useVibePadWorkspaceUiStore();
  const { project, selected, session } = useValue(() => {
    const sessionRecord = workspace.session$(sessionId)?.get();
    return {
      project: sessionRecord
        ? workspace.project$(sessionRecord.projectId)?.get()
        : undefined,
      selected: workspaceUi.state$.selectedSessionId.get() === sessionId,
      session: sessionRecord,
    };
  });
  const select = useCallback(() => {
    onSelect(sessionId);
  }, [onSelect, sessionId]);
  const close = useCallback(() => {
    onClose(sessionId);
  }, [onClose, sessionId]);

  if (!(project && session)) {
    return null;
  }

  return (
    <View
      className={cn(
        "h-10 w-96 shrink-0 flex-row items-center gap-2 rounded-lg border px-3 active:bg-accent/70",
        selected ? "border-border bg-card" : "border-transparent bg-transparent"
      )}
    >
      <Pressable
        accessibilityLabel={`Open ${session.title} in ${project.name}`}
        className="min-w-0 flex-1 flex-row items-center gap-2"
        onPress={select}
        testID={`top-tab-${session.id}`}
      >
        <HarnessIcon
          accessibilityLabel={harnessLabel(session.harnessId)}
          className={selected ? "text-foreground" : "text-muted-foreground"}
          harnessId={session.harnessId}
          size={14}
        />
        <View className="min-w-0 flex-1">
          <SessionTitle title={session.title} />
          <Text className="text-[9px]" numberOfLines={1} variant="muted">
            {project.name}
          </Text>
        </View>
      </Pressable>
      <SessionStateIndicator state={stateForSession(session)} />
      {selected ? (
        <Button
          accessibilityLabel={`Close ${session.title} tab`}
          className="-mr-1 size-6 rounded-md"
          onPress={close}
          size="icon"
          testID="selected-session-close"
          variant="ghost"
        >
          <Icon className="text-muted-foreground" name="x" size={13} />
        </Button>
      ) : null}
    </View>
  );
}

const sessionIdKey = (sessionId: string) => sessionId;
const sessionIdsEqual = (left: string, right: string) => left === right;

export function SessionTabStrip({
  onClose,
  onSelect,
  sessionIds,
}: {
  readonly onClose: (sessionId: string) => void;
  readonly onSelect: (sessionId: string) => void;
  readonly sessionIds: readonly string[];
}) {
  const renderTab = useCallback(
    ({ item }: LegendListRenderItemProps<string>) => (
      <SessionTab onClose={onClose} onSelect={onSelect} sessionId={item} />
    ),
    [onClose, onSelect]
  );

  if (sessionIds.length === 0) {
    // Legend List 3.3.3 mutates subscribers during an empty-to-populated
    // reset under React 19. Mounting after hydration avoids that reset path.
    return <View style={{ flex: 1, minWidth: 0 }} />;
  }

  return (
    <LegendList
      contentContainerStyle={{
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 4,
      }}
      data={sessionIds}
      dataKey="session-tabs"
      estimatedItemSize={384}
      horizontal
      itemsAreEqual={sessionIdsEqual}
      keyExtractor={sessionIdKey}
      recycleItems
      renderItem={renderTab}
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1, minWidth: 0 }}
    />
  );
}
