import { useCallback } from "react";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/features/composer/components/attachment";

const formatOffset = (offsetMs: number) => {
  const seconds = Math.max(0, Math.round(offsetMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

export type ReviewCaptureVisualKind = "mixed" | "selection" | "stroke";

function ReviewThumbnail({
  visualKind,
}: {
  readonly visualKind: ReviewCaptureVisualKind;
}) {
  const showsSelection = visualKind !== "stroke";
  const showsStroke = visualKind !== "selection";

  return (
    <View className="h-full w-full bg-[#f4f5f7] p-1.5">
      <View className="mb-1 h-1.5 flex-row items-center gap-0.5 rounded-full bg-[#d7dae0] px-1">
        <View className="size-0.5 rounded-full bg-red-400" />
        <View className="size-0.5 rounded-full bg-amber-400" />
        <View className="size-0.5 rounded-full bg-emerald-400" />
      </View>
      <View className="min-h-0 flex-1 flex-row gap-1">
        <View className="w-1/4 rounded-sm bg-[#dfe3e8]" />
        <View className="relative flex-1 rounded-sm bg-white">
          {showsSelection ? (
            <View className="absolute top-[22%] left-[18%] h-[36%] w-[62%] rounded-sm border border-blue-500 bg-blue-500/10" />
          ) : null}
          {showsStroke ? (
            <View
              className="absolute right-[10%] bottom-[18%] h-0.5 w-[55%] rounded-full bg-red-500"
              style={{ transform: [{ rotate: "-18deg" }] }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function ReviewCaptureAttachment({
  cueCount,
  detail,
  durationMs,
  layout = "row",
  onOpen,
  onRemove,
  title = "Preview review",
  visualKind = "mixed",
}: {
  readonly cueCount: number;
  readonly detail?: string;
  readonly durationMs: number;
  readonly layout?: "row" | "tile";
  readonly onOpen?: () => void;
  readonly onRemove?: () => void;
  readonly title?: string;
  readonly visualKind?: ReviewCaptureVisualKind;
}) {
  const open = useCallback(() => {
    onOpen?.();
  }, [onOpen]);
  const remove = useCallback(() => {
    onRemove?.();
  }, [onRemove]);
  const description =
    detail ??
    `${cueCount} ${cueCount === 1 ? "cue" : "cues"} · ${formatOffset(durationMs)}`;

  return (
    <Attachment
      orientation={layout === "tile" ? "vertical" : "horizontal"}
      testID="review-capture-attachment"
    >
      <AttachmentTrigger
        accessibilityLabel={`Open ${title}, ${description}`}
        disabled={!onOpen}
        onPress={open}
        testID="review-capture-open"
      >
        <AttachmentMedia>
          <ReviewThumbnail visualKind={visualKind} />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{title}</AttachmentTitle>
          <AttachmentDescription>{description}</AttachmentDescription>
        </AttachmentContent>
      </AttachmentTrigger>
      {onRemove ? (
        <AttachmentActions>
          <AttachmentAction
            accessibilityLabel={`Remove ${title}`}
            onPress={remove}
            testID="review-capture-remove"
          >
            <Icon className="text-muted-foreground" name="x" size={13} />
          </AttachmentAction>
        </AttachmentActions>
      ) : null}
    </Attachment>
  );
}
