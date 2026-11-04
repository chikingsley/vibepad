import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useValue } from "@legendapp/state/react";
import type {
  WorkspaceFileChange,
  WorkspaceFileNode,
} from "@vibepad/protocol/files";
import { useCallback, useMemo } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { FileContent } from "@/features/files/components/file-content";
import { FileNodeRow } from "@/features/files/components/file-node-row";
import { FileTab } from "@/features/files/components/file-tab";
import { idleFileNavigation } from "@/features/files/state/file-navigation-store";
import {
  useProjectFileChanges,
  useProjectFiles,
} from "@/lib/use-project-files";
import { cn } from "@/lib/utils";
import { useVibePadFileNavigationStore } from "@/lib/vibepad-host-context";

const filePaneBreakpoint = 720;

const sortNodes = (nodes: readonly WorkspaceFileNode[]) =>
  [...nodes].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

const fileNodeKey = (node: WorkspaceFileNode) => node.path;
const fileTabKey = (path: string) => path;

const summarizeChanges = (
  node: WorkspaceFileNode,
  changes: readonly WorkspaceFileChange[]
) => {
  const related = changes.filter((change) =>
    node.type === "directory"
      ? change.path.startsWith(node.path)
      : change.path === node.path
  );
  if (related.length === 0) {
    return;
  }
  return related.reduce(
    (summary, change) => ({
      additions: summary.additions + change.additions,
      deletions: summary.deletions + change.deletions,
    }),
    { additions: 0, deletions: 0 }
  );
};

export function FilesSurface({
  active,
  projectId,
  projectName,
  sessionId,
}: {
  readonly active: boolean;
  readonly projectId: string;
  readonly projectName: string;
  readonly sessionId: string;
}) {
  const { width } = useWindowDimensions();
  const split = width >= filePaneBreakpoint;
  const navigation = useVibePadFileNavigationStore();
  const {
    currentPath: path,
    openFiles,
    selectedFile,
  } = useValue(
    () => navigation.state$.bySessionId[sessionId]?.get() ?? idleFileNavigation
  );
  const files = useProjectFiles(projectId, path, active);
  const changes = useProjectFileChanges(projectId, active);
  const nodes = useMemo(() => sortNodes(files.data), [files.data]);

  const openFile = useCallback(
    (nextPath: string, additive: boolean) => {
      navigation.openFile(sessionId, nextPath, additive);
    },
    [navigation, sessionId]
  );

  const closeFile = useCallback(
    (closingPath: string) => {
      navigation.closeFile(sessionId, closingPath);
    },
    [navigation, sessionId]
  );

  const moveUp = useCallback(() => {
    navigation.moveToParent(sessionId);
  }, [navigation, sessionId]);
  const openDirectory = useCallback(
    (nextPath: string) => {
      navigation.openDirectory(sessionId, nextPath);
    },
    [navigation, sessionId]
  );
  const selectFile = useCallback(
    (nextPath: string) => {
      navigation.selectFile(sessionId, nextPath);
    },
    [navigation, sessionId]
  );
  const renderNode = useCallback(
    ({ item: node }: ListRenderItemInfo<WorkspaceFileNode>) => (
      <FileNodeRow
        change={summarizeChanges(node, changes.data)}
        node={node}
        onOpenDirectory={openDirectory}
        onOpenFile={openFile}
      />
    ),
    [changes.data, openDirectory, openFile]
  );
  const renderTab = useCallback(
    ({ item: openPath }: LegendListRenderItemProps<string>) => (
      <FileTab
        onClose={closeFile}
        onSelect={selectFile}
        path={openPath}
        selected={openPath === selectedFile}
      />
    ),
    [closeFile, selectFile, selectedFile]
  );

  return (
    <View
      className={cn("min-h-0 flex-1", split ? "flex-row" : "flex-col")}
      testID="files-surface"
    >
      <View
        className={cn(
          "border-border bg-muted/20",
          split ? "border-r" : "border-b"
        )}
        style={split ? { width: 284 } : { height: 220 }}
      >
        <View className="border-border h-11 flex-row items-center gap-2 border-b px-2">
          <Pressable
            accessibilityLabel="Go to parent folder"
            className="active:bg-accent rounded-md p-2"
            disabled={!path}
            onPress={moveUp}
            testID="files-parent"
          >
            <Icon
              className={path ? "text-foreground" : "text-muted-foreground/40"}
              name="chevron-left"
              size={14}
            />
          </Pressable>
          <Text className="min-w-0 flex-1 text-xs" numberOfLines={1}>
            {path || projectName}
          </Text>
          {changes.status === "ready" && changes.data.length > 0 ? (
            <Text className="text-[10px]" variant="muted">
              {changes.data.length} changed
            </Text>
          ) : null}
        </View>

        {files.status === "error" ? (
          <View className="p-3">
            <Text className="text-xs text-red-600">{files.message}</Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={{ paddingVertical: 4 }}
            data={nodes}
            key={`file-tree:${projectId}:${path}`}
            keyExtractor={fileNodeKey}
            renderItem={renderNode}
            style={{ flex: 1 }}
          />
        )}
      </View>

      <View className="min-h-0 min-w-0 flex-1">
        {openFiles.length > 0 ? (
          <View className="border-border h-9 max-h-9 border-b">
            <LegendList
              data={openFiles}
              dataKey={`file-tabs:${sessionId}`}
              estimatedItemSize={176}
              horizontal
              key={`file-tabs:${sessionId}`}
              keyExtractor={fileTabKey}
              recycleItems
              renderItem={renderTab}
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}
        <FileContent
          active={active}
          path={selectedFile}
          projectId={projectId}
        />
      </View>
    </View>
  );
}
