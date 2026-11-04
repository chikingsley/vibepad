import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { VibePadMark } from "@/components/brand/vibepad-mark";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { NativeSshOnboardingFlow } from "@/features/onboarding/components/native-ssh-onboarding-flow";

export function SettingsLoadingScreen() {
  return (
    <SafeAreaView className="bg-background flex-1 items-center justify-center">
      <View className="items-center gap-3" testID="settings-loading-screen">
        <VibePadMark className="size-12" />
        <Text className="text-sm" variant="muted">
          Opening VibePad…
        </Text>
      </View>
    </SafeAreaView>
  );
}

export function HostActivationScreen({
  errorMessage,
  onRetrySettings,
}: {
  readonly errorMessage?: string;
  readonly onRetrySettings?: () => void;
}) {
  if (errorMessage) {
    return (
      <SafeAreaView className="bg-background flex-1 items-center justify-center px-6">
        <View
          className="w-full max-w-md items-center gap-5"
          testID="settings-load-error-screen"
        >
          <VibePadMark className="size-14" />
          <View className="items-center gap-2">
            <Text className="text-center text-2xl font-semibold">
              VibePad needs another try
            </Text>
            <Text className="text-center" variant="muted">
              {errorMessage}
            </Text>
          </View>
          <Button
            className="min-w-32"
            onPress={onRetrySettings}
            testID="settings-load-retry"
          >
            <Text>Try again</Text>
          </Button>
        </View>
      </SafeAreaView>
    );
  }
  return <NativeSshOnboardingFlow />;
}
