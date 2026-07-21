import type { WorkspaceFileNode } from "@vibepad/protocol/files";
import { useCallback } from "react";
import { TouchableOpacity, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export interface FileChangeSummary {
  readonly additions: number;
  readonly deletions: number;
}

export function FileNodeRow({
  change,
  node,
  onOpenDirectory,
  onOpenFile,
}: {
  readonly change: FileChangeSummary | undefined;
  readonly node: WorkspaceFileNode;
  readonly onOpenDirectory: (path: string) => void;
  readonly onOpenFile: (path: string, additive: boolean) => void;
}) {
  const isDirectory = node.type === "directory";
  const open = useCallback(() => {
    if (isDirectory) {
      onOpenDirectory(node.path);
      return;
    }
    onOpenFile(node.path, false);
  }, [isDirectory, node.path, onOpenDirectory, onOpenFile]);
  const openAdditive = useCallback(() => {
    if (!isDirectory) {
      onOpenFile(node.path, true);
    }
  }, [isDirectory, node.path, onOpenFile]);

  return (
    <TouchableOpacity
      accessibilityLabel={`${isDirectory ? "Open folder" : "Open file"} ${node.path}`}
      accessibilityRole="button"
      activeOpacity={0.68}
      className="h-9 flex-row items-center gap-2 px-3"
      delayLongPress={350}
      onLongPress={isDirectory ? undefined : openAdditive}
      onPress={open}
      testID={`file-node-${node.path}`}
    >
      <Icon
        className={
          node.ignored ? "text-muted-foreground/45" : "text-foreground"
        }
        name={isDirectory ? "folder" : "file"}
        size={14}
      />
      <Text
        className={cn(
          "min-w-0 flex-1 text-[12px]",
          node.ignored && "text-muted-foreground/55"
        )}
        numberOfLines={1}
      >
        {node.name}
      </Text>
      {change ? (
        <View className="flex-row gap-1">
          <Text className="text-[10px] text-emerald-600">
            +{change.additions}
          </Text>
          <Text className="text-[10px] text-red-500">-{change.deletions}</Text>
        </View>
      ) : null}
      {isDirectory ? (
        <Icon
          className="text-muted-foreground"
          name="chevron-right"
          size={12}
        />
      ) : null}
    </TouchableOpacity>
  );
}
