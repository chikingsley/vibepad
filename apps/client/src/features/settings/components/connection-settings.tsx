import { View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import {
  HostPairingControl,
  RevokeCurrentHostControl,
  SavedHostList,
} from "@/features/connections/components/host-pairing-control";
import {
  SettingsList,
  SettingsRow,
} from "@/features/settings/components/settings-row";

export function ConnectionSettings({
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
