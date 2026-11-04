import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export function SettingsChoice<Value extends string>({
  description,
  label,
  onSelect,
  selected,
  testIdPrefix,
  value,
}: {
  readonly description: string;
  readonly label: string;
  readonly onSelect: (value: Value) => void;
  readonly selected: boolean;
  readonly testIdPrefix: string;
  readonly value: Value;
}) {
  const select = useCallback(() => {
    onSelect(value);
  }, [onSelect, value]);

  return (
    <Pressable
      accessibilityLabel={`${label}. ${description}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      className={cn(
        "active:bg-accent/70 min-w-48 flex-1 flex-row gap-3 rounded-xl border px-3 py-3",
        selected ? "border-primary bg-accent/60" : "border-border bg-background"
      )}
      onPress={select}
      testID={`${testIdPrefix}-${value}`}
    >
      <View
        className={cn(
          "mt-0.5 size-5 items-center justify-center rounded-full border",
          selected ? "border-primary bg-primary" : "border-muted-foreground"
        )}
      >
        {selected ? (
          <Icon className="text-primary-foreground" name="check" size={12} />
        ) : null}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-medium">{label}</Text>
        <Text className="text-xs leading-5" variant="muted">
          {description}
        </Text>
      </View>
    </Pressable>
  );
}
