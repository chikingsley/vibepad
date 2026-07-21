import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { Icon, type IconName } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { PreviewInteractionMode } from "@/features/preview/preview-interaction";
import { cn } from "@/lib/utils";

function InteractionModeButton({
  icon,
  label,
  mode,
  onSelect,
  selected,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly mode: PreviewInteractionMode;
  readonly onSelect: (mode: PreviewInteractionMode) => void;
  readonly selected: boolean;
}) {
  const select = useCallback(() => {
    onSelect(mode);
  }, [mode, onSelect]);

  return (
    <Pressable
      accessibilityLabel={`${label} preview mode`}
      className={cn(
        "h-11 flex-row items-center gap-2 rounded-md px-3 active:bg-accent",
        selected ? "bg-accent" : "bg-transparent"
      )}
      onPress={select}
      testID={`preview-mode-${mode}`}
    >
      <Icon
        className={selected ? "text-foreground" : "text-muted-foreground"}
        name={icon}
        size={13}
      />
      <Text variant="control">{label}</Text>
    </Pressable>
  );
}

export function PreviewInteractionBar({
  mode,
  onSelectMode,
}: {
  readonly mode: PreviewInteractionMode;
  readonly onSelectMode: (mode: PreviewInteractionMode) => void;
}) {
  return (
    <View className="h-12 flex-row items-center gap-1 border-border border-b px-2">
      <InteractionModeButton
        icon="browser"
        label="Interact"
        mode="browse"
        onSelect={onSelectMode}
        selected={mode === "browse"}
      />
      <InteractionModeButton
        icon="mouse-pointer"
        label="Select"
        mode="select"
        onSelect={onSelectMode}
        selected={mode === "select"}
      />
      <InteractionModeButton
        icon="pencil"
        label="Draw"
        mode="draw"
        onSelect={onSelectMode}
        selected={mode === "draw"}
      />
    </View>
  );
}
