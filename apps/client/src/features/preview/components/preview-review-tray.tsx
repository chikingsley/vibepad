import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ReviewAttachmentList } from "@/features/preview/components/review-attachment-list";
import type { PreviewFeedbackCue } from "@/features/preview/preview-review";

const sendTestId = (sending: boolean, canSend: boolean) => {
  if (sending) {
    return "preview-feedback-sending";
  }
  return canSend ? "preview-feedback-send" : "preview-feedback-send-inactive";
};

export function PreviewReviewTray({
  canSend,
  cues,
  errorMessage,
  onCancel,
  onRemoveCue,
  onSend,
  sending,
}: {
  readonly canSend: boolean;
  readonly cues: readonly PreviewFeedbackCue[];
  readonly errorMessage: string | undefined;
  readonly onCancel: () => void;
  readonly onRemoveCue: (cueId: string) => void;
  readonly onSend: () => void;
  readonly sending: boolean;
}) {
  return (
    <View
      className="border-border bg-background/95 absolute right-3 bottom-3 left-3 gap-1.5 rounded-2xl border p-2 shadow-xl shadow-black/20"
      style={styles.tray}
      testID="preview-review-tray"
    >
      {errorMessage ? (
        <Text className="px-1 text-xs text-red-600">{errorMessage}</Text>
      ) : null}
      <View className="min-w-0 flex-row items-end gap-2">
        <View className="min-w-0 flex-1">
          <ReviewAttachmentList cues={cues} onRemoveCue={onRemoveCue} />
        </View>
        <View className="flex-row items-center gap-1 pb-1">
          <Button
            accessibilityLabel="Cancel preview feedback"
            className="rounded-full"
            onPress={onCancel}
            size="icon"
            testID="preview-feedback-clear"
            variant="ghost"
          >
            <Icon className="text-muted-foreground" name="x" size={15} />
          </Button>
          <Button
            accessibilityLabel="Send preview feedback"
            className={canSend ? "bg-brand rounded-full" : "rounded-full"}
            disabled={!canSend}
            onPress={onSend}
            size="icon"
            testID={sendTestId(sending, canSend)}
          >
            <Icon
              className={canSend ? "text-white" : "text-muted-foreground"}
              name="arrow-up"
              size={16}
            />
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    elevation: 2,
    zIndex: 2,
  },
});
