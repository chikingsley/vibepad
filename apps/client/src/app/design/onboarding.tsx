import type { OnboardingPlatform } from "@vibepad/protocol/onboarding";
import { useLocalSearchParams } from "expo-router";
import { Platform } from "react-native";

import { OnboardingScreen } from "@/features/onboarding/components/onboarding-screen";
import {
  type OnboardingFixtureId,
  onboardingFixtures,
} from "@/features/onboarding/onboarding-fixtures";

const fixtureIds = new Set(Object.keys(onboardingFixtures));

const defaultPlatform = (): OnboardingPlatform => {
  if (Platform.OS === "web") {
    return "web";
  }
  return Platform.OS === "ios" && Platform.isPad ? "ipad" : "iphone";
};

export default function OnboardingFixtureRoute() {
  const parameters = useLocalSearchParams<{
    fixture?: string;
    platform?: string;
  }>();
  const fixture = fixtureIds.has(parameters.fixture ?? "")
    ? (parameters.fixture as OnboardingFixtureId)
    : "welcome";
  const platform = ["iphone", "ipad", "web"].includes(parameters.platform ?? "")
    ? (parameters.platform as OnboardingPlatform)
    : defaultPlatform();

  return (
    <OnboardingScreen
      actions={{}}
      platform={platform}
      state={onboardingFixtures[fixture]}
    />
  );
}
