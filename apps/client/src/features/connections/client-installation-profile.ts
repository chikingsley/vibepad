import type { ClientInstallationMetadata } from "@vibepad/protocol/auth";
import { applicationId, nativeApplicationVersion } from "expo-application";
import Constants from "expo-constants";
import { deviceName, modelName, osName, osVersion } from "expo-device";
import { Platform } from "react-native";

import { getInstallationId } from "./installation-id-store";

const fallbackAppId = "studio.peacockery.vibepad";
const unknown = "unknown";

const nonEmpty = (value: string | number | null | undefined) =>
  String(value ?? "").trim() || unknown;

const configuredAppId = () => {
  if (Platform.OS === "ios") {
    return Constants.expoConfig?.ios?.bundleIdentifier;
  }
  if (Platform.OS === "android") {
    return Constants.expoConfig?.android?.package;
  }
};

export const getClientInstallationMetadata =
  async (): Promise<ClientInstallationMetadata> => {
    const appVersion =
      nativeApplicationVersion ?? Constants.expoConfig?.version ?? unknown;
    return {
      appId: applicationId ?? configuredAppId() ?? fallbackAppId,
      appVersion,
      clientVersion: Constants.expoConfig?.version ?? appVersion,
      deviceModel: nonEmpty(
        modelName ?? deviceName ?? `${osName ?? Platform.OS} device`
      ),
      installationId: await getInstallationId(),
      osVersion: nonEmpty(osVersion ?? Platform.Version),
      platform: Platform.OS,
    };
  };
