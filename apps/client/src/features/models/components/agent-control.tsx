import { useObservable, useValue } from "@legendapp/state/react";
import type { TriggerRef } from "@rn-primitives/popover";
import type { AgentSummary, ProviderCatalog } from "@vibepad/protocol/catalog";
import { useCallback, useRef } from "react";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

function AgentOption({
  agent,
  onSelect,
  selected,
}: {
  readonly agent: AgentSummary;
  readonly onSelect: (agent: AgentSummary) => void;
  readonly selected: boolean;
}) {
  const select = useCallback(() => {
    onSelect(agent);
  }, [agent, onSelect]);
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "min-h-10 flex-row items-center gap-2 rounded-lg px-2 py-2",
        selected ? "bg-accent" : "active:bg-accent"
      )}
      onPress={select}
      testID={`agent-option-${agent.id}`}
    >
      <Text className="min-w-0 flex-1 text-sm">{agent.id}</Text>
      {selected ? <Icon name="check" size={13} /> : null}
    </Pressable>
  );
}

export function AgentControl({
  catalog,
  controlLabel,
  current,
  disabled,
  onSelect,
}: {
  readonly catalog: ProviderCatalog | undefined;
  readonly controlLabel: string;
  readonly current: string | undefined;
  readonly disabled: boolean;
  readonly onSelect: (agentId: string) => Promise<void>;
}) {
  const triggerRef = useRef<TriggerRef>(null);
  const state$ = useObservable({
    error: undefined as string | undefined,
    selecting: false,
  });
  const { error, selecting } = useValue(state$);
  const agents =
    catalog?.agents.filter(
      (agent) => !agent.hidden && agent.mode !== "subagent"
    ) ?? [];
  const select = useCallback(
    async (agent: AgentSummary) => {
      if (state$.selecting.peek()) {
        return;
      }
      state$.assign({ error: undefined, selecting: true });
      try {
        await onSelect(agent.id);
        triggerRef.current?.close();
      } catch (reason) {
        state$.error.set(
          reason instanceof Error ? reason.message : "Unable to switch agent"
        );
      } finally {
        state$.selecting.set(false);
      }
    },
    [onSelect, state$]
  );

  return (
    <Popover>
      <PopoverTrigger asChild ref={triggerRef}>
        <Button
          accessibilityLabel={`Choose ${controlLabel.toLowerCase()}`}
          className="h-8 flex-row gap-1 px-2"
          disabled={disabled || selecting}
          testID="agent-selector"
          variant="ghost"
        >
          <Text
            className={cn(
              "text-[11px] capitalize",
              current === "plan"
                ? "text-amber-600 dark:text-amber-400"
                : "text-blue-600 dark:text-blue-400"
            )}
          >
            {current ?? controlLabel}
          </Text>
          <Icon
            className="text-muted-foreground"
            name="chevron-down"
            size={10}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 gap-1 rounded-xl p-2"
        side="top"
        sideOffset={8}
        testID="agent-selector-menu"
      >
        <View pointerEvents={selecting ? "none" : "auto"}>
          <Text className="px-2 pt-1 pb-1 text-xs font-semibold">
            {controlLabel}
          </Text>
          {agents.map((agent) => (
            <AgentOption
              agent={agent}
              key={agent.id}
              onSelect={select}
              selected={agent.id === current}
            />
          ))}
        </View>
        {error ? (
          <Text className="px-2 text-xs text-red-600">{error}</Text>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
