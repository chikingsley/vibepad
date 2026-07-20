import "../global.css";

import { PortalHost } from "@rn-primitives/portal";
import { useFonts } from "expo-font";
import { Stack, ThemeProvider } from "expo-router";
import { hideAsync, preventAutoHideAsync } from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AppSettingsProvider } from "@/features/settings/settings-context";
import { NAV_THEME } from "@/lib/theme";

preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const { colorScheme = "dark" } = useColorScheme();
  const [iconsLoaded, iconFontError] = useFonts({
    VibePadProviders: require("../../assets/icons/nanoicons/VibePadProviders.ttf"),
    VibePadUI: require("../../assets/icons/nanoicons/VibePadUI.ttf"),
  });

  useEffect(() => {
    if (iconsLoaded || iconFontError) {
      hideAsync().catch(() => undefined);
    }
  }, [iconFontError, iconsLoaded]);

  if (!(iconsLoaded || iconFontError)) {
    return null;
  }

  return (
    <ThemeProvider value={NAV_THEME[colorScheme]}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppSettingsProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <PortalHost />
        </AppSettingsProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
