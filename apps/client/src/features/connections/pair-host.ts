import { Platform } from "react-native";

import type { VibePadHostClient } from "@/lib/vibepad-host";

export const clientDeviceName =
  Platform.select({
    android: "VibePad on Android",
    default: "VibePad device",
    ios: "VibePad on iPad",
    web: "VibePad Web",
  }) ?? "VibePad device";

export const pairHostInvitation = async (
  host: VibePadHostClient,
  endpoints: readonly string[],
  code: string
) => {
  let latestError: unknown;
  for (const endpoint of endpoints) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: Pairing tries each advertised route in priority order.
      const paired = await host.pair(endpoint, {
        code,
        deviceName: clientDeviceName,
      });
      return { endpoint, paired };
    } catch (error) {
      latestError = error;
    }
  }
  throw latestError ?? new Error("The computer returned no reachable address");
};
