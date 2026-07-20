import type {
  ProjectSummary,
  SessionSummary,
} from "@vibepad/protocol/provider";
import { useCallback } from "react";
import { Pressable, ScrollView, View } from "react-native";

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

export interface SessionTabItem {
  readonly project: ProjectSummary;
  readonly session: SessionSummary;
}

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
  item,
  onClose,
  onSelect,
  selected,
}: {
  readonly item: SessionTabItem;
  readonly onClose: (sessionId: string) => void;
  readonly onSelect: (sessionId: string) => void;
  readonly selected: boolean;
}) {
  const select = useCallback(() => {
    onSelect(item.session.id);
  }, [item.session.id, onSelect]);
  const close = useCallback(() => {
    onClose(item.session.id);
  }, [item.session.id, onClose]);

  return (
    <View
      className={cn(
        "h-10 w-96 shrink-0 flex-row items-center gap-2 rounded-lg border px-3 active:bg-accent/70",
        selected ? "border-border bg-card" : "border-transparent bg-transparent"
      )}
    >
      <Pressable
        accessibilityLabel={`Open ${item.session.title} in ${item.project.name}`}
        className="min-w-0 flex-1 flex-row items-center gap-2"
        onPress={select}
        testID={`top-tab-${item.session.id}`}
      >
        <HarnessIcon
          accessibilityLabel={harnessLabel(item.session.harnessId)}
          className={selected ? "text-foreground" : "text-muted-foreground"}
          harnessId={item.session.harnessId}
          size={14}
        />
        <View className="min-w-0 flex-1">
          <SessionTitle title={item.session.title} />
          <Text className="text-[9px]" numberOfLines={1} variant="muted">
            {item.project.name}
          </Text>
        </View>
      </Pressable>
      <SessionStateIndicator state={stateForSession(item.session)} />
      {selected ? (
        <Button
          accessibilityLabel={`Close ${item.session.title} tab`}
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

export function SessionTabStrip({
  items,
  onClose,
  onSelect,
  selectedSessionId,
}: {
  readonly items: readonly SessionTabItem[];
  readonly onClose: (sessionId: string) => void;
  readonly onSelect: (sessionId: string) => void;
  readonly selectedSessionId: string | undefined;
}) {
  return (
    <ScrollView
      className="min-w-0 flex-1"
      contentContainerClassName="flex-row items-center gap-1 px-1"
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      testID="session-tab-strip"
    >
      {items.map((item) => (
        <SessionTab
          item={item}
          key={item.session.id}
          onClose={onClose}
          onSelect={onSelect}
          selected={item.session.id === selectedSessionId}
        />
      ))}
    </ScrollView>
  );
}
