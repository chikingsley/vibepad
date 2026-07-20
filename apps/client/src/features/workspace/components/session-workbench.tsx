import type { ProjectSummary } from "@vibepad/protocol/provider";
import { type Dispatch, type SetStateAction, useCallback } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ChangesSurface } from "@/features/changes/components/changes-surface";
import { FilesSurface } from "@/features/files/components/files-surface";
import { PreviewSurface } from "@/features/preview/components/preview-surface";
import type { PreviewReviewDraft } from "@/features/preview/preview-review";
import type { WorkbenchSurface } from "@/features/workspace/components/session-workbench-controls";

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

export function SessionWorkbench({
  canSendReview,
  expanded,
  hostName,
  onClose,
  onReviewChange,
  onSendReview,
  onToggleExpanded,
  onUrlChange,
  project,
  review,
  sendError,
  sessionId,
  sending,
  showPreviewReviewTray,
  surface,
}: {
  readonly canSendReview: boolean;
  readonly expanded: boolean;
  readonly hostName: string;
  readonly onClose: () => void;
  readonly onReviewChange: Dispatch<SetStateAction<PreviewReviewDraft>>;
  readonly onSendReview: () => void;
  readonly onToggleExpanded: () => void;
  readonly onUrlChange: (url: string) => void;
  readonly project: ProjectSummary;
  readonly review: PreviewReviewDraft;
  readonly sendError: string | undefined;
  readonly sessionId: string;
  readonly sending: boolean;
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

      <View
        className="min-h-0 flex-1"
        style={{ display: surface === "preview" ? "flex" : "none" }}
      >
        <PreviewSurface
          canSendReview={canSendReview}
          errorMessage={sendError}
          expanded={expanded}
          hostName={hostName}
          onClose={close}
          onReviewChange={onReviewChange}
          onSendReview={onSendReview}
          onToggleExpanded={toggleExpanded}
          onUrlChange={onUrlChange}
          review={review}
          sending={sending}
          showReviewTray={showPreviewReviewTray}
        />
      </View>
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
