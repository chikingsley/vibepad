import { MotionSurface } from "@vibepad/ui/motion-surface";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";

const { EXPO_PUBLIC_VIBEPAD_HOST_URL } = process.env;
const hostUrl = EXPO_PUBLIC_VIBEPAD_HOST_URL ?? "http://127.0.0.1:4100";

type HostState = "checking" | "idle" | "offline" | "online";

export default function WorkspaceScreen() {
  const [hostState, setHostState] = useState<HostState>("idle");

  const checkHost = async () => {
    setHostState("checking");
    try {
      const response = await fetch(`${hostUrl}/health`);
      setHostState(response.ok ? "online" : "offline");
    } catch {
      setHostState("offline");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow px-5 py-4 sm:px-8 sm:py-7">
        <View className="mx-auto w-full max-w-6xl gap-5">
          <MotionSurface>
            <View className="gap-4 rounded-2xl border border-border bg-card p-5 sm:p-7">
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <View className="gap-1">
                  <Text className="text-left text-3xl sm:text-4xl" variant="h1">
                    VibePad
                  </Text>
                  <Text variant="muted">Universal agent workbench</Text>
                </View>
                <Badge
                  variant={hostState === "online" ? "default" : "secondary"}
                >
                  <Text>{hostState}</Text>
                </Badge>
              </View>

              <Separator />

              <View className="gap-3 sm:flex-row sm:items-end sm:justify-between">
                <View className="max-w-2xl gap-1">
                  <Text variant="small">First vertical slice</Text>
                  <Text variant="muted">
                    Connect to the host, discover real OpenCode projects and
                    sessions, then stream a live conversation without flattening
                    provider-native events.
                  </Text>
                </View>
                <Button disabled={hostState === "checking"} onPress={checkHost}>
                  <Text>
                    {hostState === "checking"
                      ? "Checking…"
                      : "Check local host"}
                  </Text>
                </Button>
              </View>
            </View>
          </MotionSurface>

          <View className="gap-4 lg:flex-row">
            <MotionSurface delay={70} style={{ flex: 1 }}>
              <View className="h-full gap-2 rounded-2xl border border-border bg-card p-5">
                <Text variant="h3">OpenCode first</Text>
                <Text variant="muted">
                  The generated v2 SDK owns session lifecycle, durable events,
                  steering, models, permissions, questions, and filesystem
                  operations.
                </Text>
              </View>
            </MotionSurface>

            <MotionSurface delay={120} style={{ flex: 1 }}>
              <View className="h-full gap-2 rounded-2xl border border-border bg-card p-5">
                <Text variant="h3">Capabilities are evidence</Text>
                <Text variant="muted">
                  The UI reads adapter capabilities. Shared concepts are
                  promoted only after a real provider path proves their meaning.
                </Text>
              </View>
            </MotionSurface>

            <MotionSurface delay={170} style={{ flex: 1 }}>
              <View className="h-full gap-2 rounded-2xl border border-border bg-card p-5">
                <Text variant="h3">Motion is structural</Text>
                <Text variant="muted">
                  Reanimated 4 primitives and reduced-motion behavior are shared
                  from the first screen instead of added after the workspace is
                  complete.
                </Text>
              </View>
            </MotionSurface>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
