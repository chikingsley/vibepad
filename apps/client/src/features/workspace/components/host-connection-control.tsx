import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  ConnectionIndicator,
  type HostConnection,
} from "@/features/workspace/components/status-indicators";

export function HostConnectionControl({
  connection,
  hostName,
}: {
  readonly connection: HostConnection;
  readonly hostName: string;
}) {
  return (
    <View
      accessibilityLabel={`${hostName} is ${connection}`}
      className="hidden h-11 shrink-0 flex-row items-center gap-2 px-2 sm:flex"
      testID="header-host-status"
    >
      <Icon className="text-muted-foreground" name="laptop" size={12} />
      <Text className="text-xs leading-4" variant="muted">
        {hostName}
      </Text>
      <ConnectionIndicator connection={connection} />
    </View>
  );
}
