import type { TriggerRef } from "@rn-primitives/popover";
import { useCallback, useRef } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Text } from "@/components/ui/text";
import {
  ConnectionIndicator,
  type HostConnection,
} from "@/features/workspace/components/status-indicators";

function HealthRow({
  healthy,
  label,
}: {
  readonly healthy: boolean;
  readonly label: string;
}) {
  return (
    <View className="flex-row items-center gap-2 py-1.5">
      <View
        className={
          healthy
            ? "size-1.5 rounded-full bg-emerald-500"
            : "size-1.5 rounded-full bg-red-500"
        }
      />
      <Text className="min-w-0 flex-1 text-xs">{label}</Text>
      <Text className="text-[10px]" variant="muted">
        {healthy ? "Ready" : "Unavailable"}
      </Text>
    </View>
  );
}

const providerLabel = (providerId: string) => {
  if (providerId === "opencode") {
    return "OpenCode provider";
  }
  if (providerId === "codex") {
    return "Codex provider";
  }
  return `${providerId} provider`;
};

export function HostConnectionControl({
  connection,
  hostName,
  hostUrl,
  onAddConnection,
  providers,
}: {
  readonly connection: HostConnection;
  readonly hostName: string;
  readonly hostUrl: string;
  readonly onAddConnection: () => void;
  readonly providers: HostHealthResponse["providers"];
}) {
  const hostHealthy = connection === "online";
  const triggerRef = useRef<TriggerRef>(null);
  const close = useCallback(() => {
    triggerRef.current?.close();
  }, []);
  const addConnection = useCallback(() => {
    close();
    onAddConnection();
  }, [close, onAddConnection]);

  return (
    <Popover>
      <PopoverTrigger asChild ref={triggerRef}>
        <Button
          accessibilityLabel={`Open ${hostName} connection details`}
          className="hidden h-8 flex-row items-center gap-1.5 rounded-md bg-muted px-2 sm:flex"
          testID="header-host-status"
          variant="ghost"
        >
          <Icon className="text-muted-foreground" name="laptop" size={12} />
          <Text className="text-[11px]" variant="muted">
            {hostName}
          </Text>
          <ConnectionIndicator connection={connection} />
          <Icon
            className="text-muted-foreground"
            name="chevron-down"
            size={10}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 gap-3 rounded-xl p-3"
        side="bottom"
        sideOffset={6}
        testID="host-connection-menu"
      >
        <View className="flex-row items-start gap-2 px-1">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="font-semibold text-sm">{hostName}</Text>
            <Text className="text-[10px]" numberOfLines={1} variant="muted">
              {hostUrl}
            </Text>
          </View>
          <Button
            accessibilityLabel="Close connection details"
            className="size-7 rounded-md"
            onPress={close}
            size="icon"
            testID="host-connection-close"
            variant="ghost"
          >
            <Icon className="text-muted-foreground" name="x" size={12} />
          </Button>
        </View>
        <View className="rounded-lg bg-muted/55 px-3 py-2">
          <HealthRow healthy={hostHealthy} label="VibePad host" />
          {providers.map((provider) => (
            <HealthRow
              healthy={provider.healthy}
              key={provider.id}
              label={providerLabel(provider.id)}
            />
          ))}
        </View>
        <View className="gap-1 border-border border-t pt-3">
          <Button
            accessibilityLabel="Add host connection"
            className="h-9 justify-start px-2"
            onPress={addConnection}
            testID="host-add-connection"
            variant="ghost"
          >
            <Icon name="plus" size={13} />
            <Text>Add connection</Text>
            <Text className="ml-auto text-[10px]" variant="muted">
              Pair host
            </Text>
          </Button>
          <Text className="px-2 text-[10px] leading-4" variant="muted">
            Pairing exchanges a short-lived code for a revocable device token.
          </Text>
        </View>
      </PopoverContent>
    </Popover>
  );
}

import type { HostHealthResponse } from "@vibepad/protocol/transport";
