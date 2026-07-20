import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

function VoiceWaveform({ levels }: { readonly levels: readonly number[] }) {
  const displayLevels = levels.length > 0 ? levels : [0.08];
  return (
    <View
      accessibilityLabel="Voice waveform"
      className="h-10 min-w-0 flex-1 flex-row items-center justify-end gap-[3px] overflow-hidden px-3"
    >
      {displayLevels.map((level, index) => (
        <View
          className="w-[3px] rounded-full bg-foreground"
          // biome-ignore lint/suspicious/noArrayIndexKey: waveform points are an ephemeral ordered signal.
          key={index}
          style={{
            height: Math.max(3, Math.round(level * 30)),
            opacity: 0.28 + (0.72 * (index + 1)) / displayLevels.length,
          }}
        />
      ))}
    </View>
  );
}

export function DictationRecordingSurface({
  interimText,
  levels,
  onSend,
  onStop,
}: {
  readonly interimText?: string;
  readonly levels: readonly number[];
  readonly onSend: () => void;
  readonly onStop: () => void;
}) {
  return (
    <View className="min-h-16 flex-row items-center gap-2 rounded-full px-1">
      <Button
        accessibilityLabel="Stop dictation"
        className="rounded-full"
        onPress={onStop}
        size="icon"
        testID="dictation-stop"
        variant="secondary"
      >
        <Icon name="square" size={14} />
      </Button>
      {interimText ? (
        <View className="min-w-0 flex-1 px-2" testID="dictation-interim-text">
          <Text className="text-center text-sm" numberOfLines={2}>
            {interimText}
          </Text>
        </View>
      ) : (
        <VoiceWaveform levels={levels} />
      )}
      <Button
        accessibilityLabel="Transcribe and send"
        className="rounded-full bg-blue-500 active:bg-blue-600"
        onPress={onSend}
        size="icon"
        testID="dictation-send"
      >
        <Icon className="text-white" name="arrow-up" size={16} />
      </Button>
    </View>
  );
}
