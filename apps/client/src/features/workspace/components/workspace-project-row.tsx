import { useValue } from "@legendapp/state/react";
import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  ConnectionIndicator,
  type HostConnection,
  SessionStateIndicator,
} from "@/features/workspace/components/status-indicators";
import { aggregateSessionState } from "@/features/workspace/components/workspace-row-state";
import {
  useVibePadWorkspaceStore,
  useVibePadWorkspaceUiStore,
} from "@/lib/vibepad-host-context";

export function WorkspaceProjectRow({
  hostConnection,
  hostName,
  projectId,
}: {
  readonly hostConnection: HostConnection;
  readonly hostName: string;
  readonly projectId: string;
}) {
  const workspace = useVibePadWorkspaceStore();
  const workspaceUi = useVibePadWorkspaceUiStore();
  const { open, project, sessions } = useValue(() => {
    const projectRecord = workspace.project$(projectId)?.get();
    const sessionIds = workspace.projectSessionIds$(projectId)?.get() ?? [];
    return {
      open: workspaceUi.state$.expandedProjects[projectId]?.get() ?? false,
      project: projectRecord,
      sessions: sessionIds.flatMap((sessionId) => {
        const session = workspace.session$(sessionId)?.get();
        return session ? [session] : [];
      }),
    };
  });
  const toggle = useCallback(() => {
    workspaceUi.setProjectExpanded(projectId, !open);
  }, [open, projectId, workspaceUi]);

  if (!project) {
    return null;
  }
  const state = aggregateSessionState(sessions);
  const showAggregateState = !open && state !== "idle";

  return (
    <Pressable
      accessibilityLabel={`${open ? "Collapse" : "Expand"} ${project.name}`}
      className="flex-row items-center gap-2 rounded-lg px-2 py-2 active:bg-accent/70"
      onPress={toggle}
      testID={`workspace-${project.id}-toggle`}
    >
      <Icon
        className="text-muted-foreground"
        name={open ? "chevron-down" : "chevron-right"}
        size={14}
      />
      <Icon className="text-foreground" name="folder" size={15} />
      <Text className="min-w-0 flex-1 font-medium text-sm" numberOfLines={1}>
        {project.name}
      </Text>
      <Text className="max-w-24 text-xs" numberOfLines={1} variant="muted">
        {hostName}
      </Text>
      <View
        className="w-4 shrink-0 items-center"
        testID={
          hostConnection === "offline" || !showAggregateState
            ? `workspace-${project.id}-connection`
            : `workspace-${project.id}-state`
        }
      >
        {hostConnection === "offline" || !showAggregateState ? (
          <ConnectionIndicator connection={hostConnection} />
        ) : (
          <SessionStateIndicator state={state} />
        )}
      </View>
    </Pressable>
  );
}
