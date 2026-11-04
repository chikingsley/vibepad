import type { VoiceCleanupPromptProfile } from "@vibepad/protocol/settings";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect } from "react";
import { Switch, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { SettingsChoice } from "@/features/settings/components/settings-choice";
import {
  SettingsList,
  SettingsRow,
} from "@/features/settings/components/settings-row";
import {
  VoiceCleanupModelPicker,
  VoiceCleanupProfileControl,
} from "@/features/settings/components/voice-cleanup-controls";
import {
  useAppSettingsStore,
  useSettingsValue,
} from "@/features/settings/settings-context";
import { useVoiceCatalog } from "@/features/voice/use-voice-catalog";
import { THEME } from "@/lib/theme";

const voiceModelLabel = (model: string) => {
  if (model === "elevenlabs-scribe_v2") {
    return "Scribe v2";
  }
  return model;
};

export function VoiceSettings() {
  const { update } = useAppSettingsStore();
  const voice = useSettingsValue((state$) => state$.settings.voice.get());
  const catalog = useVoiceCatalog();
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  useEffect(() => {
    if (catalog.models.length === 0) {
      return;
    }
    update((current) => {
      const selected = current.voice.cleanup.model;
      if (selected && catalog.models.some((model) => model.id === selected)) {
        return current;
      }
      return {
        ...current,
        voice: {
          ...current.voice,
          cleanup: {
            ...current.voice.cleanup,
            model: catalog.models[0]?.id ?? null,
          },
        },
      };
    });
  }, [catalog.models, update]);

  const toggleInterim = useCallback(
    (showInterimTranscript: boolean) => {
      update((current) => ({
        ...current,
        voice: { ...current.voice, showInterimTranscript },
      }));
    },
    [update]
  );
  const selectTransport = useCallback(
    (transport: "host" | "hosted") => {
      update((current) => ({
        ...current,
        voice: { ...current.voice, transport },
      }));
    },
    [update]
  );
  const toggleCleanup = useCallback(
    (enabled: boolean) => {
      update((current) => ({
        ...current,
        voice: {
          ...current.voice,
          cleanup: { ...current.voice.cleanup, enabled },
        },
      }));
    },
    [update]
  );
  const selectCleanupModel = useCallback(
    (model: string) => {
      update((current) => ({
        ...current,
        voice: {
          ...current.voice,
          cleanup: { ...current.voice.cleanup, model },
        },
      }));
    },
    [update]
  );
  const selectPromptProfile = useCallback(
    (promptProfile: VoiceCleanupPromptProfile) => {
      update((current) => ({
        ...current,
        voice: {
          ...current.voice,
          cleanup: { ...current.voice.cleanup, promptProfile },
        },
      }));
    },
    [update]
  );
  const cleanupConfigured = Boolean(
    voice.cleanup.model &&
      catalog.models.some((model) => model.id === voice.cleanup.model)
  );
  let cleanupStatus = "Ready";
  if (voice.cleanup.enabled) {
    cleanupStatus = "On";
  } else if (catalog.status === "loading" || catalog.status === "idle") {
    cleanupStatus = "Loading…";
  } else if (catalog.errorMessage) {
    cleanupStatus = "Unavailable";
  } else if (!cleanupConfigured) {
    cleanupStatus = "No models";
  }

  return (
    <View className="gap-6">
      <View className="gap-1">
        <Text className="text-xl font-semibold">Voice</Text>
        <Text className="text-sm" variant="muted">
          Session dictation stays editable and separate from spoken alerts and
          the future conversational orchestrator.
        </Text>
      </View>

      <View className="gap-3">
        <Text
          className="text-xs font-medium tracking-wider uppercase"
          variant="muted"
        >
          Dictation
        </Text>
        <View
          accessibilityRole="radiogroup"
          className="flex-row flex-wrap gap-3"
        >
          <SettingsChoice
            description="Route dictation through the paired host. This remains the simulator and self-hosted default."
            label="Paired host"
            onSelect={selectTransport}
            selected={voice.transport === "host"}
            testIdPrefix="voice-transport"
            value="host"
          />
          <SettingsChoice
            description="Connect straight to Peacockery Voice with a device-bound Secure Enclave key."
            label="Hosted direct"
            onSelect={selectTransport}
            selected={voice.transport === "hosted"}
            testIdPrefix="voice-transport"
            value="hosted"
          />
        </View>
        <SettingsList>
          <SettingsRow
            description="The current audited realtime model works through either the paired host or the device-bound hosted connection."
            title="Transcription model"
          >
            <Badge variant="secondary">
              <Text>{voiceModelLabel(voice.transcriptionModel)}</Text>
            </Badge>
          </SettingsRow>
          <SettingsRow
            description="Show bounded interim words inside the recording surface while speaking. The transcript never grows over the conversation."
            title="Show words while speaking"
          >
            <Switch
              accessibilityLabel="Show words while speaking"
              onValueChange={toggleInterim}
              testID="voice-show-interim"
              thumbColor={theme.background}
              trackColor={{ false: theme.muted, true: theme.primary }}
              value={voice.showInterimTranscript}
            />
          </SettingsRow>
        </SettingsList>
      </View>

      <View className="gap-3">
        <View className="flex-row items-center gap-2">
          <Text
            className="text-xs font-medium tracking-wider uppercase"
            variant="muted"
          >
            AI cleanup
          </Text>
          <Badge variant={voice.cleanup.enabled ? "secondary" : "outline"}>
            <Text>{cleanupStatus}</Text>
          </Badge>
        </View>
        <SettingsList>
          <SettingsRow
            description="After realtime transcription, the trusted host can send the editable text through Peacockery Voice /v1/text. If cleanup fails, VibePad keeps the raw transcript."
            title="Clean up dictation"
          >
            <Switch
              accessibilityLabel="Clean up dictation"
              disabled={!(voice.cleanup.enabled || cleanupConfigured)}
              onValueChange={toggleCleanup}
              testID="voice-cleanup-enabled"
              thumbColor={theme.background}
              trackColor={{ false: theme.muted, true: theme.primary }}
              value={voice.cleanup.enabled}
            />
          </SettingsRow>
          <SettingsRow
            description={
              catalog.errorMessage ??
              "Loaded from Voice Lab's authenticated language-model catalog through the host."
            }
            title="Cleanup model"
          >
            <VoiceCleanupModelPicker
              disabled={
                catalog.status === "loading" || catalog.models.length === 0
              }
              models={catalog.models}
              onSelect={selectCleanupModel}
              selectedModelId={voice.cleanup.model}
            />
          </SettingsRow>
          <SettingsRow
            description="Coding removes false starts while preserving identifiers and commands. Light stays closer to the original wording."
            title="Prompt profile"
          >
            <VoiceCleanupProfileControl
              onSelect={selectPromptProfile}
              selected={voice.cleanup.promptProfile}
            />
          </SettingsRow>
        </SettingsList>
      </View>
    </View>
  );
}
