import { useValue } from "@legendapp/state/react";

import { SessionCanvas } from "@/features/workspace/components/session-canvas";
import { defaultWorkbenchLayout } from "@/features/workspace/state/workspace-ui-store";
import {
  useVibePadWorkspaceStore,
  useVibePadWorkspaceUiStore,
} from "@/lib/vibepad-host-context";

export function WorkspaceSessionCanvas({
  active,
  errorMessage,
  hostName,
  loading,
  sessionId,
}: {
  readonly active: boolean;
  readonly errorMessage: string | undefined;
  readonly hostName: string;
  readonly loading: boolean;
  readonly sessionId: string | undefined;
}) {
  const workspace = useVibePadWorkspaceStore();
  const workspaceUi = useVibePadWorkspaceUiStore();
  const { project, session, workbench } = useValue(() => {
    const sessionRecord = sessionId
      ? workspace.session$(sessionId)?.get()
      : undefined;
    return {
      project: sessionRecord
        ? workspace.project$(sessionRecord.projectId)?.get()
        : undefined,
      session: sessionRecord,
      workbench: sessionId
        ? (workspaceUi.state$.workbenchesBySessionId[sessionId]?.get() ??
          defaultWorkbenchLayout)
        : defaultWorkbenchLayout,
    };
  });

  return (
    <SessionCanvas
      active={active}
      errorMessage={errorMessage}
      hostName={hostName}
      loading={loading}
      onCloseWorkbench={workspaceUi.closeWorkbench}
      onSessionChange={workspace.upsertSession}
      onToggleWorkbenchExpanded={workspaceUi.toggleWorkbenchExpanded}
      project={project}
      session={session}
      workbench={workbench}
    />
  );
}
