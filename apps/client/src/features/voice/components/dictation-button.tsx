import { ActivityIndicator } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { DictationPhase } from "@/features/voice/use-session-dictation";

export function DictationButton({
  disabled,
  onPress,
  phase,
}: {
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly phase: DictationPhase;
}) {
  const busy =
    phase === "connecting" ||
    phase === "processing" ||
    phase === "requesting_permission";
  return (
    <Button
      accessibilityLabel={busy ? "Transcribing voice" : "Dictate message"}
      className="rounded-full"
      disabled={disabled || busy}
      onPress={onPress}
      size="icon"
      testID="dictation-toggle"
      variant="ghost"
    >
      {busy ? (
        <ActivityIndicator size="small" />
      ) : (
        <Icon
          className={
            phase === "failed" ? "text-red-600" : "text-muted-foreground"
          }
          name="mic"
          size={17}
        />
      )}
    </Button>
  );
}
