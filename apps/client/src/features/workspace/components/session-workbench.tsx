import { useValue } from "@legendapp/state/react";
import type { ProjectSummary } from "@vibepad/protocol/provider";
import { useCallback } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ChangesSurface } from "@/features/changes/components/changes-surface";
import { FilesSurface } from "@/features/files/components/files-surface";
import { PreviewSurface } from "@/features/preview/components/preview-surface";
import { emptyPreviewReviewDraft } from "@/features/preview/preview-review";
import type { WorkbenchSurface } from "@/features/workspace/components/session-workbench-controls";
import {
  useVibePadPreviewStore,
  useVibePadSessionComposerStore,
} from "@/lib/vibepad-host-context";

const titleForSurface = {
  changes: "Changes",
  files: "Files",
  preview: "Preview",
} as const satisfies Record<WorkbenchSurface, string>;

const iconForSurface = {
  changes: "git-branch",
  files: "folder",
  preview: "browser",
} as const satisfies Record<
  WorkbenchSurface,
  "browser" | "folder" | "git-branch"
>;

function PreviewWorkbenchSurface({
  expanded,
  hostName,
  onClose,
  onSendReview,
  onToggleExpanded,
  sessionId,
  showReviewTray,
}: {
  readonly expanded: boolean;
  readonly hostName: string;
  readonly onClose: () => void;
  readonly onSendReview: () => void;
  readonly onToggleExpanded: () => void;
  readonly sessionId: string;
  readonly showReviewTray: boolean;
}) {
  const composer = useVibePadSessionComposerStore();
  const preview = useVibePadPreviewStore();
  const state = useValue(() => {
    const composer$ = composer.state$.bySessionId[sessionId];
    const review$ = preview.state$.bySessionId[sessionId]?.review;
    return {
      cueCount:
        review$?.cues.get().length ?? emptyPreviewReviewDraft.cues.length,
      draftHasText: (composer$?.draft.get() ?? "").trim().length > 0,
      pendingSelectionCount:
        review$?.pendingSelectionCount.get() ??
        emptyPreviewReviewDraft.pendingSelectionCount,
      sendError: composer$?.sendError.get(),
      sending: composer$?.sending.get() ?? false,
    };
  });
  const canSendReview =
    !state.sending &&
    state.pendingSelectionCount === 0 &&
    (state.draftHasText || state.cueCount > 0);

  return (
    <PreviewSurface
      canSendReview={canSendReview}
      errorMessage={state.sendError}
      expanded={expanded}
      hostName={hostName}
      onClose={onClose}
      onSendReview={onSendReview}
      onToggleExpanded={onToggleExpanded}
      sending={state.sending}
      sessionId={sessionId}
      showReviewTray={showReviewTray}
    />
  );
}

export function SessionWorkbench({
  expanded,
  hostName,
  onClose,
  onSendReview,
  onToggleExpanded,
  project,
  sessionId,
  showPreviewReviewTray,
  surface,
}: {
  readonly expanded: boolean;
  readonly hostName: string;
  readonly onClose: () => void;
  readonly onSendReview: () => void;
  readonly onToggleExpanded: () => void;
  readonly project: ProjectSummary;
  readonly sessionId: string;
  readonly showPreviewReviewTray: boolean;
  readonly surface: WorkbenchSurface;
}) {
  const close = useCallback(() => {
    onClose();
  }, [onClose]);
  const toggleExpanded = useCallback(() => {
    onToggleExpanded();
  }, [onToggleExpanded]);

  return (
    <View className="min-h-0 flex-1 bg-background" testID="session-workbench">
      {surface === "preview" ? null : (
        <View className="h-10 flex-row items-center gap-2 border-border border-b px-2.5">
          <Icon
            className="text-muted-foreground"
            name={iconForSurface[surface]}
            size={13}
          />
          <Text className="font-medium text-xs">
            {titleForSurface[surface]}
          </Text>
          <Text
            className="min-w-0 flex-1 text-[10px]"
            numberOfLines={1}
            variant="muted"
          >
            {project.name}
          </Text>
          <Button
            accessibilityLabel={
              expanded ? "Restore split view" : "Expand workbench"
            }
            onPress={toggleExpanded}
            size="icon"
            testID="session-workbench-expand"
            variant="ghost"
          >
            <Icon
              className="text-muted-foreground"
              name={expanded ? "minimize-2" : "maximize-2"}
              size={14}
            />
          </Button>
          <Button
            accessibilityLabel="Close workbench"
            onPress={close}
            size="icon"
            testID="session-workbench-close"
            variant="ghost"
          >
            <Icon className="text-muted-foreground" name="x" size={14} />
          </Button>
        </View>
      )}

      {surface === "preview" ? (
        <View className="min-h-0 flex-1">
          <PreviewWorkbenchSurface
            expanded={expanded}
            hostName={hostName}
            onClose={close}
            onSendReview={onSendReview}
            onToggleExpanded={toggleExpanded}
            sessionId={sessionId}
            showReviewTray={showPreviewReviewTray}
          />
        </View>
      ) : null}
      {surface === "files" ? (
        <View className="min-h-0 flex-1">
          <FilesSurface
            active
            projectId={project.id}
            projectName={project.name}
            sessionId={sessionId}
          />
        </View>
      ) : null}
      {surface === "changes" ? (
        <View className="min-h-0 flex-1">
          <ChangesSurface active projectId={project.id} sessionId={sessionId} />
        </View>
      ) : null}
    </View>
  );
}
