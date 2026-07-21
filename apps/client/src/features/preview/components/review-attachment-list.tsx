import { useCallback } from "react";
import { View } from "react-native";

import { AttachmentGroup } from "@/features/composer/components/attachment";
import { ReviewCaptureAttachment } from "@/features/preview/components/review-capture-attachment";
import {
  type PreviewFeedbackCue,
  reviewCueDetail,
  reviewCueLabel,
} from "@/features/preview/preview-review";

function ReviewCueCard({
  cue,
  onOpen,
  onRemove,
}: {
  readonly cue: PreviewFeedbackCue;
  readonly onOpen?: (cueId: string) => void;
  readonly onRemove?: (cueId: string) => void;
}) {
  const open = useCallback(() => onOpen?.(cue.id), [cue.id, onOpen]);
  const remove = useCallback(() => onRemove?.(cue.id), [cue.id, onRemove]);

  return (
    <ReviewCaptureAttachment
      cueCount={1}
      detail={reviewCueDetail(cue)}
      durationMs={cue.offsetMs}
      layout="tile"
      {...(onOpen ? { onOpen: open } : {})}
      {...(onRemove ? { onRemove: remove } : {})}
      title={reviewCueLabel(cue)}
      visualKind={cue.kind}
    />
  );
}

export function ReviewAttachmentList({
  cues,
  onOpenCue,
  onRemoveCue,
}: {
  readonly cues: readonly PreviewFeedbackCue[];
  readonly onOpenCue?: (cueId: string) => void;
  readonly onRemoveCue?: (cueId: string) => void;
}) {
  const cueLabel = `${cues.length} ${cues.length === 1 ? "cue" : "cues"}`;
  const hasSelection = cues.some((cue) => cue.kind === "selection");

  return (
    <View
      accessibilityLabel={cueLabel}
      accessible
      testID="preview-feedback-count"
    >
      <View testID={hasSelection ? "preview-selection-label" : undefined}>
        <AttachmentGroup>
          {cues.map((cue) => (
            <ReviewCueCard
              cue={cue}
              key={cue.id}
              {...(onOpenCue ? { onOpen: onOpenCue } : {})}
              {...(onRemoveCue ? { onRemove: onRemoveCue } : {})}
            />
          ))}
        </AttachmentGroup>
      </View>
    </View>
  );
}
