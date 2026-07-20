import { useCallback } from "react";
import { Pressable } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const fileName = (path: string) =>
  path.split("/").filter(Boolean).at(-1) ?? path;

export function FileTab({
  onClose,
  onSelect,
  path,
  selected,
}: {
  readonly onClose: (path: string) => void;
  readonly onSelect: (path: string) => void;
  readonly path: string;
  readonly selected: boolean;
}) {
  const select = useCallback(() => onSelect(path), [onSelect, path]);
  const close = useCallback(() => onClose(path), [onClose, path]);

  return (
    <Pressable
      accessibilityLabel={`Open file ${path}`}
      className={cn(
        "h-9 flex-row items-center gap-2 border-border border-r px-3 active:bg-accent",
        selected && "bg-accent/70"
      )}
      onPress={select}
      testID={`file-tab-${path}`}
    >
      <Text className="max-w-44 text-[11px]" numberOfLines={1}>
        {fileName(path)}
      </Text>
      <Pressable
        accessibilityLabel={`Close file ${path}`}
        className="rounded p-0.5 active:bg-muted"
        hitSlop={8}
        onPress={close}
      >
        <Icon className="text-muted-foreground" name="x" size={11} />
      </Pressable>
    </Pressable>
  );
}
