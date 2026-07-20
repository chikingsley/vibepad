import { useObservable, useValue } from "@legendapp/state/react";
import type { TriggerRef } from "@rn-primitives/popover";
import type { ModelReference } from "@vibepad/protocol/catalog";
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

function ReasoningEffortOption({
  onSelect,
  selected,
  variant,
}: {
  readonly onSelect: (variant: string) => Promise<void>;
  readonly selected: boolean;
  readonly variant: string;
}) {
  const handlePress = useCallback(() => {
    onSelect(variant).catch(() => undefined);
  }, [onSelect, variant]);

  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "min-h-10 flex-row items-center gap-2 rounded-lg px-2 py-2",
        selected ? "bg-accent" : "active:bg-accent"
      )}
      onPress={handlePress}
      testID={`reasoning-effort-option-${variant}`}
    >
      <Text className="min-w-0 flex-1 text-sm capitalize">{variant}</Text>
      {selected ? <Icon name="check" size={13} /> : null}
    </Pressable>
  );
}

export function ReasoningEffortControl({
  current,
  disabled,
  onSelect,
  variants,
}: {
  readonly current: ModelReference | undefined;
  readonly disabled: boolean;
  readonly onSelect: (model: ModelReference) => Promise<void>;
  readonly variants: readonly string[];
}) {
  const triggerRef = useRef<TriggerRef>(null);
  const state$ = useObservable({
    error: undefined as string | undefined,
    selecting: false,
  });
  const { error, selecting } = useValue(state$);
  const select = useCallback(
    async (variant: string) => {
      if (!current || state$.selecting.peek()) {
        return;
      }
      state$.assign({ error: undefined, selecting: true });
      try {
        await onSelect({ ...current, variant });
        triggerRef.current?.close();
      } catch (reason) {
        state$.error.set(
          reason instanceof Error
            ? reason.message
            : "Unable to switch reasoning effort"
        );
      } finally {
        state$.selecting.set(false);
      }
    },
    [current, onSelect, state$]
  );

  if (!(current && variants.length > 0)) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild ref={triggerRef}>
        <Button
          accessibilityLabel="Choose reasoning effort"
          className="h-8 flex-row gap-1 px-2"
          disabled={disabled || selecting}
          testID="reasoning-effort-selector"
          variant="ghost"
        >
          <Text className="text-[11px] capitalize" variant="muted">
            {current.variant ?? "Effort"}
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
        testID="reasoning-effort-menu"
      >
        <View pointerEvents={selecting ? "none" : "auto"}>
          <Text className="px-2 pt-1 pb-1 font-semibold text-xs">
            Reasoning effort
          </Text>
          {variants.map((variant) => {
            const selected = variant === current.variant;
            return (
              <ReasoningEffortOption
                key={variant}
                onSelect={select}
                selected={selected}
                variant={variant}
              />
            );
          })}
        </View>
        {error ? (
          <Text className="px-2 text-red-600 text-xs">{error}</Text>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
