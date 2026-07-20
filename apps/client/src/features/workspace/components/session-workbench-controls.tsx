import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type WorkbenchSurface = "changes" | "files" | "preview";
export type SessionSurface = "chat" | WorkbenchSurface;

interface SurfaceDefinition {
  readonly icon: IconName;
  readonly id: SessionSurface;
  readonly label: string;
}

const surfaces: readonly SurfaceDefinition[] = [
  { icon: "message-square", id: "chat", label: "Chat" },
  { icon: "folder", id: "files", label: "Files" },
  { icon: "git-branch", id: "changes", label: "Changes" },
  { icon: "browser", id: "preview", label: "Preview" },
];

function SurfaceControl({
  onSelect,
  selected,
  surface,
}: {
  readonly onSelect: (surface: SessionSurface) => void;
  readonly selected: boolean;
  readonly surface: SurfaceDefinition;
}) {
  const select = useCallback(() => {
    onSelect(surface.id);
  }, [onSelect, surface.id]);

  return (
    <Pressable
      accessibilityLabel={`Show session ${surface.label}`}
      className={cn(
        "size-8 items-center justify-center rounded-md active:bg-accent",
        selected && "bg-accent"
      )}
      onPress={select}
      testID={`session-surface-${surface.id}`}
    >
      <Icon
        className={selected ? "text-blue-600" : "text-muted-foreground"}
        name={surface.icon}
        size={14}
      />
    </Pressable>
  );
}

export function SessionWorkbenchControls({
  onSelect,
  selected,
}: {
  readonly onSelect: (surface: SessionSurface) => void;
  readonly selected: SessionSurface;
}) {
  return (
    <View
      className="flex-row items-center gap-0.5 border-border border-l pl-2"
      testID="session-workbench-controls"
    >
      {surfaces.map((surface) => (
        <SurfaceControl
          key={surface.id}
          onSelect={onSelect}
          selected={surface.id === selected}
          surface={surface}
        />
      ))}
    </View>
  );
}
