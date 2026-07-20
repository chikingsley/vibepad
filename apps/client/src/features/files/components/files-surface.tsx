import type {
  WorkspaceFileChange,
  WorkspaceFileNode,
} from "@vibepad/protocol/files";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useProjectFileChanges,
  useProjectFileContent,
  useProjectFiles,
} from "@/lib/use-project-files";
import { cn } from "@/lib/utils";

const filePaneBreakpoint = 720;

const parentPath = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length > 0 ? `${parts.join("/")}/` : "";
};

const fileName = (path: string) =>
  path.split("/").filter(Boolean).at(-1) ?? path;

const sortNodes = (nodes: readonly WorkspaceFileNode[]) =>
  [...nodes].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

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

function FileNodeRow({
  change,
  node,
  onOpenDirectory,
  onOpenFile,
}: {
  readonly change: ReturnType<typeof summarizeChanges>;
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
    <Pressable
      accessibilityLabel={`${isDirectory ? "Open folder" : "Open file"} ${node.path}`}
      className="h-9 flex-row items-center gap-2 px-3 active:bg-accent"
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
    </Pressable>
  );
}

function FileTab({
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

function FileContent({
  active,
  path,
  projectId,
}: {
  readonly active: boolean;
  readonly path: string | undefined;
  readonly projectId: string;
}) {
  const content = useProjectFileContent(projectId, path, active);

  if (!path) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text variant="muted">Select a file to inspect it.</Text>
      </View>
    );
  }
  if (content.status === "loading" || content.status === "idle") {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text variant="muted">Loading {path}…</Text>
      </View>
    );
  }
  if (content.status === "error") {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-red-600 text-sm">{content.message}</Text>
      </View>
    );
  }
  if (content.data.type === "binary") {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text variant="muted">
          Binary file
          {content.data.mimeType ? ` · ${content.data.mimeType}` : ""}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="min-w-full p-4"
      testID="file-content"
    >
      <Text className="font-mono text-[12px] leading-5" selectable>
        {content.data.content}
      </Text>
    </ScrollView>
  );
}

export function FilesSurface({
  active,
  projectId,
  projectName,
}: {
  readonly active: boolean;
  readonly projectId: string;
  readonly projectName: string;
}) {
  const { width } = useWindowDimensions();
  const split = width >= filePaneBreakpoint;
  const [path, setPath] = useState("");
  const [openFiles, setOpenFiles] = useState<readonly string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const files = useProjectFiles(projectId, path, active);
  const changes = useProjectFileChanges(projectId, active);
  const nodes = useMemo(() => sortNodes(files.data), [files.data]);

  const openFile = useCallback(
    (nextPath: string, additive: boolean) => {
      setOpenFiles((current) => {
        if (current.includes(nextPath)) {
          return current;
        }
        if (additive || !selectedFile) {
          return [...current, nextPath];
        }
        const selectedIndex = current.indexOf(selectedFile);
        if (selectedIndex < 0) {
          return [nextPath];
        }
        return current.map((item, index) =>
          index === selectedIndex ? nextPath : item
        );
      });
      setSelectedFile(nextPath);
    },
    [selectedFile]
  );

  const closeFile = useCallback(
    (closingPath: string) => {
      setOpenFiles((current) => {
        const closingIndex = current.indexOf(closingPath);
        const remaining = current.filter((item) => item !== closingPath);
        if (selectedFile === closingPath) {
          setSelectedFile(
            remaining[Math.min(Math.max(closingIndex, 0), remaining.length - 1)]
          );
        }
        return remaining;
      });
    },
    [selectedFile]
  );

  const moveUp = useCallback(
    () => setPath((current) => parentPath(current)),
    []
  );
  const openDirectory = useCallback(
    (nextPath: string) => setPath(nextPath),
    []
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
        <View className="h-11 flex-row items-center gap-2 border-border border-b px-2">
          <Pressable
            accessibilityLabel="Go to parent folder"
            className="rounded-md p-2 active:bg-accent"
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
            <Text className="text-red-600 text-xs">{files.message}</Text>
          </View>
        ) : (
          <ScrollView className="flex-1" contentContainerClassName="py-1">
            {nodes.map((node) => {
              const change = summarizeChanges(node, changes.data);
              return (
                <FileNodeRow
                  change={change}
                  key={node.path}
                  node={node}
                  onOpenDirectory={openDirectory}
                  onOpenFile={openFile}
                />
              );
            })}
          </ScrollView>
        )}
      </View>

      <View className="min-h-0 min-w-0 flex-1">
        {openFiles.length > 0 ? (
          <ScrollView
            className="h-9 max-h-9 border-border border-b"
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {openFiles.map((openPath) => (
              <FileTab
                key={openPath}
                onClose={closeFile}
                onSelect={setSelectedFile}
                path={openPath}
                selected={openPath === selectedFile}
              />
            ))}
          </ScrollView>
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
