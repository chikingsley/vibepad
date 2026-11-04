import { useValue } from "@legendapp/state/react";
import { useCallback, useState } from "react";
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
  newSessionDisabled,
  onCreateSession,
  projectId,
}: {
  readonly hostConnection: HostConnection;
  readonly hostName: string;
  readonly newSessionDisabled: boolean;
  readonly onCreateSession: (projectId: string) => Promise<void>;
  readonly projectId: string;
}) {
  const workspace = useVibePadWorkspaceStore();
  const workspaceUi = useVibePadWorkspaceUiStore();
  const [creating, setCreating] = useState(false);
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
  const createSession = useCallback(() => {
    if (creating) {
      return;
    }
    setCreating(true);
    onCreateSession(projectId)
      .catch(() => undefined)
      .finally(() => {
        setCreating(false);
      });
  }, [creating, onCreateSession, projectId]);

  if (!project) {
    return null;
  }
  const state = aggregateSessionState(sessions);
  const showAggregateState = !open && state !== "idle";

  return (
    <View className="active:bg-accent/70 h-11 flex-row items-center rounded-lg">
      <Pressable
        accessibilityLabel={`${open ? "Collapse" : "Expand"} ${project.name}`}
        className="min-w-0 flex-1 flex-row items-center gap-2 px-2"
        onPress={toggle}
        testID={`workspace-${project.id}-toggle`}
      >
        <Icon
          className="text-muted-foreground"
          name={open ? "chevron-down" : "chevron-right"}
          size={14}
        />
        <Icon className="text-foreground" name="folder" size={15} />
        <Text className="min-w-0 flex-1 text-sm font-medium" numberOfLines={1}>
          {project.name}
        </Text>
        <Text className="max-w-20 text-xs" numberOfLines={1} variant="muted">
          {hostName}
        </Text>
      </Pressable>
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
      <Pressable
        accessibilityLabel={`New chat in ${project.name}`}
        className="active:bg-accent size-11 items-center justify-center rounded-md"
        disabled={newSessionDisabled || creating}
        onPress={createSession}
        testID={`workspace-${project.id}-new-session`}
      >
        <Icon
          className={
            newSessionDisabled || creating
              ? "text-muted-foreground/50"
              : "text-muted-foreground"
          }
          name="plus"
          size={14}
        />
      </Pressable>
    </View>
  );
}
