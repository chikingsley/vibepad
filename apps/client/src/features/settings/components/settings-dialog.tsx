import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
} from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ConnectionSettings } from "@/features/settings/components/connection-settings";
import { SettingsNavigation } from "@/features/settings/components/settings-navigation";
import { TimelineSettings } from "@/features/settings/components/timeline-settings";
import { VoiceSettings } from "@/features/settings/components/voice-settings";
import {
  useAppSettingsStore,
  useSettingsValue,
} from "@/features/settings/settings-context";
import type { SettingsPage } from "@/features/settings/settings-page";
import { cn } from "@/lib/utils";

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
