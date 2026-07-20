import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useValue } from "@legendapp/state/react";
import type { WorkspaceFileChange } from "@vibepad/protocol/files";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";

import { Text } from "@/components/ui/text";
import { idleFileNavigation } from "@/features/files/state/file-navigation-store";
import { useProjectFileChanges } from "@/lib/use-project-files";
import { cn } from "@/lib/utils";
import { useVibePadFileNavigationStore } from "@/lib/vibepad-host-context";

const changesPaneBreakpoint = 720;

const statusLabel = {
  added: "A",
  deleted: "D",
  modified: "M",
} as const;

const patchLineClass = (line: string) => {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return "text-muted-foreground";
  }
  if (line.startsWith("+")) {
    return "bg-emerald-500/10 text-emerald-700";
  }
  if (line.startsWith("-")) {
    return "bg-red-500/10 text-red-700";
  }
  if (line.startsWith("@@")) {
    return "bg-blue-500/10 text-blue-700";
  }
  return "text-foreground";
};

function ChangeRow({
  change,
  onSelect,
  selected,
}: {
  readonly change: WorkspaceFileChange;
  readonly onSelect: (path: string) => void;
  readonly selected: boolean;
}) {
  const select = useCallback(
    () => onSelect(change.path),
    [change.path, onSelect]
  );

  return (
    <Pressable
      accessibilityLabel={`Open change ${change.path}`}
      className={cn(
        "min-h-11 flex-row items-center gap-2 px-3 py-2 active:bg-accent",
        selected && "bg-accent/70"
      )}
      onPress={select}
      testID={`change-file-${change.path}`}
    >
      <Text
        className={cn(
          "w-4 text-center font-semibold text-[10px]",
          change.status === "added" && "text-emerald-600",
          change.status === "deleted" && "text-red-600",
          change.status === "modified" && "text-amber-600"
        )}
      >
        {statusLabel[change.status]}
      </Text>
      <Text className="min-w-0 flex-1 text-[11px]" numberOfLines={2}>
        {change.path}
      </Text>
      <View className="flex-row gap-1">
        <Text className="text-[10px] text-emerald-600">
          +{change.additions}
        </Text>
        <Text className="text-[10px] text-red-500">-{change.deletions}</Text>
      </View>
    </Pressable>
  );
}

const patchLineKey = (_line: string, index: number) => `${index}`;
const changeKey = ({ path }: WorkspaceFileChange) => path;

const renderPatchLine = ({
  item,
  index,
}: LegendListRenderItemProps<string>) => (
  <View className={cn("min-h-5 flex-row", patchLineClass(item))}>
    <Text className="w-12 shrink-0 px-2 text-right font-mono text-[10px] text-muted-foreground/60">
      {index + 1}
    </Text>
    <Text
      className="min-w-0 flex-1 pr-3 font-mono text-[11px] leading-5"
      selectable
    >
      {item || " "}
    </Text>
  </View>
);

export function ChangesSurface({
  active,
  projectId,
  sessionId,
}: {
  readonly active: boolean;
  readonly projectId: string;
  readonly sessionId: string;
}) {
  const { width } = useWindowDimensions();
  const split = width >= changesPaneBreakpoint;
  const changes = useProjectFileChanges(projectId, active);
  const navigation = useVibePadFileNavigationStore();
  const requestedPath = useValue(
    () =>
      navigation.state$.bySessionId[sessionId]?.selectedChange.get() ??
      idleFileNavigation.selectedChange
  );
  const selectedPath = changes.data.some(
    (change) => change.path === requestedPath
  )
    ? requestedPath
    : changes.data[0]?.path;

  const selectedChange = changes.data.find(
    (change) => change.path === selectedPath
  );
  const patchLines = useMemo(
    () => selectedChange?.patch?.split("\n") ?? [],
    [selectedChange]
  );
  const totals = useMemo(
    () =>
      changes.data.reduce(
        (summary, change) => ({
          additions: summary.additions + change.additions,
          deletions: summary.deletions + change.deletions,
        }),
        { additions: 0, deletions: 0 }
      ),
    [changes.data]
  );
  const selectChange = useCallback(
    (path: string) => navigation.selectChange(sessionId, path),
    [navigation, sessionId]
  );
  const renderChange = useCallback(
    ({ item }: LegendListRenderItemProps<WorkspaceFileChange>) => (
      <ChangeRow
        change={item}
        onSelect={selectChange}
        selected={item.path === selectedPath}
      />
    ),
    [selectChange, selectedPath]
  );
  let changeList: ReactNode;
  if (changes.status === "error") {
    changeList = (
      <View className="p-3">
        <Text className="text-red-600 text-xs">{changes.message}</Text>
      </View>
    );
  } else if (changes.status === "loading" && changes.data.length === 0) {
    changeList = (
      <View className="p-3">
        <Text variant="muted">Loading working-tree changes…</Text>
      </View>
    );
  } else if (changes.data.length === 0) {
    changeList = (
      <View className="p-3">
        <Text variant="muted">Working tree clean.</Text>
      </View>
    );
  } else {
    changeList = (
      <LegendList
        data={changes.data}
        dataKey={`changes:${projectId}`}
        estimatedItemSize={44}
        key={`changes:${projectId}`}
        keyExtractor={changeKey}
        recycleItems
        renderItem={renderChange}
        style={{ flex: 1 }}
      />
    );
  }

  return (
    <View
      className={cn("min-h-0 flex-1", split ? "flex-row" : "flex-col")}
      testID="changes-surface"
    >
      <View
        className={cn(
          "border-border bg-muted/20",
          split ? "border-r" : "border-b"
        )}
        style={split ? { width: 320 } : { height: 220 }}
      >
        <View className="h-11 flex-row items-center border-border border-b px-3">
          <Text className="font-medium text-xs">
            {changes.data.length} changed
          </Text>
          <View className="ml-auto flex-row gap-1.5">
            <Text className="text-[10px] text-emerald-600">
              +{totals.additions}
            </Text>
            <Text className="text-[10px] text-red-500">
              -{totals.deletions}
            </Text>
          </View>
        </View>

        {changeList}
      </View>

      <View className="min-h-0 min-w-0 flex-1">
        {selectedChange ? (
          <>
            <View className="h-11 flex-row items-center gap-3 border-border border-b px-4">
              <Text className="min-w-0 flex-1 text-xs" numberOfLines={1}>
                {selectedChange.path}
              </Text>
              <Text className="text-[10px] text-emerald-600">
                +{selectedChange.additions}
              </Text>
              <Text className="text-[10px] text-red-500">
                -{selectedChange.deletions}
              </Text>
            </View>
            {patchLines.length > 0 ? (
              <View className="min-h-0 flex-1" testID="change-patch">
                <LegendList
                  data={patchLines}
                  dataKey={`patch:${selectedChange.path}`}
                  estimatedItemSize={20}
                  key={`patch:${selectedChange.path}`}
                  keyExtractor={patchLineKey}
                  recycleItems
                  renderItem={renderPatchLine}
                  style={{ flex: 1 }}
                />
              </View>
            ) : (
              <View className="flex-1 items-center justify-center px-8">
                <Text variant="muted">
                  No patch is available for this file.
                </Text>
              </View>
            )}
          </>
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Text variant="muted">
              Select a changed file to inspect its diff.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
