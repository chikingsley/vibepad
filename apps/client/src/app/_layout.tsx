import "../global.css";

import { PortalHost } from "@rn-primitives/portal";
import { Stack, ThemeProvider } from "expo-router";
import { hideAsync, preventAutoHideAsync } from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { NAV_THEME } from "@/lib/theme";

preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const { colorScheme = "dark" } = useColorScheme();

  useEffect(() => {
    hideAsync().catch(() => undefined);
  }, []);

  return (
    <ThemeProvider value={NAV_THEME[colorScheme]}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} />
        <PortalHost />
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
