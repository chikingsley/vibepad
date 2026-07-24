import { View } from "react-native";

import {
  HostPairingControl,
  SavedHostList,
} from "@/features/connections/components/host-pairing-control";
import { SshComputerSetup } from "@/features/connections/components/ssh-computer-setup";

export function ConnectionSettings() {
  return (
    <View className="gap-4">
      <SavedHostList />
      <HostPairingControl />
      <SshComputerSetup />
    </View>
  );
}
