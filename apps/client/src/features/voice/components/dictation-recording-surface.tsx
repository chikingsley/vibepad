import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { DictationRuntimeState } from "@/features/voice/state/dictation-runtime-store";
import { waveformPointCount } from "@/features/voice/waveform-levels";

const waveformSlots = Array.from(
  { length: waveformPointCount },
  (_, index) => index
);

function VoiceWaveformBar({
  levels,
  slot,
}: {
  readonly levels: SharedValue<number[]>;
  readonly slot: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const samples = levels.get();
    const dataIndex = samples.length - (waveformPointCount - slot);
    const waiting = samples.length === 0 && slot === waveformPointCount - 1;
    const visible = dataIndex >= 0 || waiting;
    const level = waiting ? 0.08 : (samples[dataIndex] ?? 0);
    let opacity = 0;
    if (waiting) {
      opacity = 0.28;
    } else if (visible) {
      opacity = 0.28 + (0.72 * (dataIndex + 1)) / samples.length;
    }
    return {
      height: Math.max(3, Math.round(level * 30)),
      opacity,
    };
  });

  return (
    <Animated.View
      className="w-[3px] rounded-full bg-foreground"
      style={animatedStyle}
    />
  );
}

function VoiceWaveform({ levels }: { readonly levels: SharedValue<number[]> }) {
  return (
    <View
      accessibilityLabel="Voice waveform"
      className="h-10 min-w-0 flex-1 flex-row items-center justify-end gap-[3px] overflow-hidden px-3"
    >
      {waveformSlots.map((slot) => (
        <VoiceWaveformBar
          key={`waveform-slot-${slot}`}
          levels={levels}
          slot={slot}
        />
      ))}
    </View>
  );
}

export function DictationRecordingSurface({
  levels,
  onSend,
  onStop,
  state$,
}: {
  readonly levels: SharedValue<number[]>;
  readonly onSend: () => void;
  readonly onStop: () => void;
  readonly state$: Observable<DictationRuntimeState>;
}) {
  const interimText = useValue(state$.interimText);

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
