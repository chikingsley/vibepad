import type {
  TimelineOpeningPreference,
  VoiceCleanupPromptProfile,
} from "@vibepad/protocol/settings";
import { appSettingsSchemaVersion } from "@vibepad/protocol/settings";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect } from "react";
import {
  Pressable,
  ScrollView,
  Switch,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
} from "react-native-reanimated";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  HostPairingControl,
  RevokeCurrentHostControl,
  SavedHostList,
} from "@/features/connections/components/host-pairing-control";
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
import type { SettingsPage } from "@/features/settings/settings-page";
import { useVoiceCatalog } from "@/features/voice/use-voice-catalog";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

const settingsPages: readonly {
  readonly icon: IconName;
  readonly id: SettingsPage;
  readonly label: string;
}[] = [
  { icon: "message-square", id: "timeline", label: "Timeline" },
  { icon: "mic", id: "voice", label: "Voice" },
  { icon: "laptop", id: "connections", label: "Connections" },
];

const voiceModelLabel = (model: string) => {
  if (model === "elevenlabs-scribe_v2") {
    return "Scribe v2";
  }
  return model;
};

function SettingsNavigation({
  compact,
  onSelect,
  selected,
}: {
  readonly compact: boolean;
  readonly onSelect: (page: SettingsPage) => void;
  readonly selected: SettingsPage;
}) {
  return (
    <View
      className={cn(
        "border-border bg-muted/35 p-3",
        compact ? "border-b" : "w-52 border-r"
      )}
    >
      <Text
        className="px-2 pb-2 font-medium text-[10px] uppercase tracking-widest"
        variant="muted"
      >
        VibePad
      </Text>
      <View className={cn("gap-1", compact && "flex-row")}>
        {settingsPages.map((page) => (
          <SettingsNavigationItem
            compact={compact}
            key={page.id}
            onSelect={onSelect}
            page={page}
            selected={page.id === selected}
          />
        ))}
      </View>
      {compact ? null : (
        <Text className="mt-auto px-2 pt-6 text-[10px]" variant="muted">
          Preferences schema v{appSettingsSchemaVersion}
        </Text>
      )}
    </View>
  );
}

function SettingsNavigationItem({
  compact,
  onSelect,
  page,
  selected,
}: {
  readonly compact: boolean;
  readonly onSelect: (page: SettingsPage) => void;
  readonly page: (typeof settingsPages)[number];
  readonly selected: boolean;
}) {
  const select = useCallback(() => {
    onSelect(page.id);
  }, [onSelect, page.id]);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      aria-selected={selected}
      className={cn(
        "min-h-10 flex-row items-center gap-2 rounded-lg px-3 active:bg-accent",
        compact && "flex-1 justify-center",
        selected && "bg-accent"
      )}
      onPress={select}
      testID={`settings-page-${page.id}`}
    >
      <Icon
        className={
          selected ? "text-accent-foreground" : "text-muted-foreground"
        }
        name={page.icon}
        size={15}
      />
      <Text className="font-medium text-xs">{page.label}</Text>
    </Pressable>
  );
}

const settingsPersistenceLabel = (state: string) => {
  if (state === "saving") {
    return "Saving…";
  }
  if (state === "loading") {
    return "Loading…";
  }
  if (state === "error") {
    return "Not saved";
  }
  return "Saved";
};

function TimelineSettings() {
  const { update } = useAppSettingsStore();
  const selectedOpening = useSettingsValue((state$) =>
    state$.settings.timeline.opening.get()
  );
  const selectOpening = useCallback(
    (opening: TimelineOpeningPreference) => {
      update((current) => ({
        ...current,
        timeline: { ...current.timeline, opening },
      }));
    },
    [update]
  );

  return (
    <View className="gap-6">
      <View className="gap-1">
        <Text className="font-semibold text-xl">Timeline</Text>
        <Text className="text-sm" variant="muted">
          Choose the point VibePad restores when a session opens or becomes
          active again.
        </Text>
      </View>

      <View className="gap-3">
        <Text
          className="font-medium text-xs uppercase tracking-wider"
          variant="muted"
        >
          Open sessions at
        </Text>
        <View
          accessibilityRole="radiogroup"
          className="flex-row flex-wrap gap-3"
        >
          <SettingsChoice
            description="Start at the latest completed assistant answer."
            label="Latest answer"
            onSelect={selectOpening}
            selected={selectedOpening === "latest-response"}
            testIdPrefix="timeline-opening"
            value="latest-response"
          />
          <SettingsChoice
            description="Return to the last stable message and reading offset."
            label="Last position"
            onSelect={selectOpening}
            selected={selectedOpening === "last-position"}
            testIdPrefix="timeline-opening"
            value="last-position"
          />
          <SettingsChoice
            description="Open directly at the newest event and follow the tail."
            label="Bottom"
            onSelect={selectOpening}
            selected={selectedOpening === "bottom"}
            testIdPrefix="timeline-opening"
            value="bottom"
          />
        </View>
      </View>

      <SettingsList>
        <SettingsRow
          description="VibePad stores a stable timeline item plus its relative reading offset for each session, rather than relying on a fragile absolute pixel position."
          title="Saved reading position"
        >
          <Badge variant="secondary">
            <Text>Per session</Text>
          </Badge>
        </SettingsRow>
      </SettingsList>
    </View>
  );
}

function VoiceSettings() {
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
        <Text className="font-semibold text-xl">Voice</Text>
        <Text className="text-sm" variant="muted">
          Session dictation stays editable and separate from spoken alerts and
          the future conversational orchestrator.
        </Text>
      </View>

      <View className="gap-3">
        <Text
          className="font-medium text-xs uppercase tracking-wider"
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
            description="Connect straight to Peacockery Voice with App Attest and a device-bound Secure Enclave key."
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
            className="font-medium text-xs uppercase tracking-wider"
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

function ConnectionSettings({
  hostName,
  hostUrl,
}: {
  readonly hostName: string;
  readonly hostUrl: string;
}) {
  return (
    <View className="gap-6">
      <View className="gap-1">
        <Text className="font-semibold text-xl">Connections</Text>
        <Text className="text-sm" variant="muted">
          Host metadata and host credentials have separate storage boundaries.
        </Text>
      </View>
      <SettingsList>
        <SettingsRow
          description="Paired host metadata is stored with preferences; each device token remains in the separate credential store."
          title="Paired hosts"
        >
          <SavedHostList />
        </SettingsRow>
        <SettingsRow description={hostUrl} title={hostName}>
          <Badge variant="secondary">
            <Text>Current host</Text>
          </Badge>
        </SettingsRow>
        <SettingsRow
          description="On iPad and iPhone, secrets use Expo SecureStore instead of the SQLite preferences payload. Web keeps credentials in memory for the current page lifetime and requires pairing again after a reload."
          title="Credential storage"
        >
          <Badge variant="outline">
            <Text>Separate</Text>
          </Badge>
        </SettingsRow>
        <SettingsRow
          description="A paired device receives a revocable bearer token. Only its hash is retained by the host."
          title="Current device authorization"
        >
          <RevokeCurrentHostControl />
        </SettingsRow>
      </SettingsList>
      <HostPairingControl />
    </View>
  );
}

export function SettingsDialog({
  hostName,
  hostUrl,
  onClose,
  onSelectPage,
  page,
}: {
  readonly hostName: string;
  readonly hostUrl: string;
  readonly onClose: () => void;
  readonly onSelectPage: (page: SettingsPage) => void;
  readonly page: SettingsPage;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const { reset } = useAppSettingsStore();
  const { errorMessage, persistenceState } = useSettingsValue((state$) => ({
    errorMessage: state$.errorMessage.get(),
    persistenceState: state$.persistenceState.get(),
  }));
  const persistenceLabel = settingsPersistenceLabel(persistenceState);

  return (
    <Animated.View
      accessibilityViewIsModal
      className="absolute inset-0 z-[100] items-center justify-center px-4 py-8"
      entering={FadeIn.duration(140).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
      testID="settings-dialog"
    >
      <Pressable
        accessibilityLabel="Close settings"
        className="absolute inset-0 bg-black/45"
        onPress={onClose}
        testID="settings-backdrop"
      />
      <View
        className="max-h-full w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-black/30"
        style={{ height: compact ? "94%" : "86%" }}
      >
        <View className="h-14 flex-row items-center gap-3 border-border border-b px-4">
          <View className="size-8 items-center justify-center rounded-lg bg-foreground">
            <Icon className="text-background" name="settings" size={16} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="font-semibold text-sm">Settings</Text>
            <Text
              className={cn(
                "text-[10px]",
                persistenceState === "error" && "text-red-600"
              )}
              variant={persistenceState === "error" ? "default" : "muted"}
            >
              {errorMessage ?? persistenceLabel}
            </Text>
          </View>
          <Button
            accessibilityLabel="Restore settings defaults"
            onPress={reset}
            size="sm"
            testID="settings-reset"
            variant="ghost"
          >
            <Text>Restore defaults</Text>
          </Button>
          <Button
            accessibilityLabel="Close settings"
            onPress={onClose}
            size="icon"
            testID="settings-close"
            variant="ghost"
          >
            <Icon name="x" size={16} />
          </Button>
        </View>

        <View
          className={cn("min-h-0 flex-1", compact ? "flex-col" : "flex-row")}
        >
          <SettingsNavigation
            compact={compact}
            onSelect={onSelectPage}
            selected={page}
          />
          <ScrollView
            className="min-w-0 flex-1"
            contentContainerClassName="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 sm:py-8"
            keyboardShouldPersistTaps="handled"
            testID="settings-content"
          >
            {page === "timeline" ? <TimelineSettings /> : null}
            {page === "voice" ? <VoiceSettings /> : null}
            {page === "connections" ? (
              <ConnectionSettings hostName={hostName} hostUrl={hostUrl} />
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Animated.View>
  );
}
