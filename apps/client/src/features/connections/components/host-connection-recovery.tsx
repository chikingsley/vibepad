import SshBootstrap from "@vibepad/ssh-bootstrap";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { subscribeToNearbyHosts } from "@/features/connections/nearby-host-discovery";
import { recoverSavedHost } from "@/features/connections/recover-saved-host";
import { reportComputerConnection } from "@/features/connections/state/computer-connections";
import {
  useAppSettingsStore,
  useSettingsValue,
} from "@/features/settings/settings-context";

export function HostConnectionRecovery({
  errorMessage,
  hostId,
  hostName,
  onOpenConnections,
  onRetry,
}: {
  readonly errorMessage: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly onOpenConnections: () => void;
  readonly onRetry: () => void;
}) {
  const { update } = useAppSettingsStore();
  const savedHost = useSettingsValue((state$) =>
    state$.settings.connections.hosts
      .get()
      .find((candidate) => candidate.id === hostId)
  );
  const [recoveryError, setRecoveryError] = useState<string>();
  const [starting, setStarting] = useState(false);
  const attempted = useRef(false);
  const startAndRetry = useCallback(async () => {
    if (!savedHost?.automaticStart.enabled) {
      onRetry();
      return;
    }
    setStarting(true);
    setRecoveryError(undefined);
    reportComputerConnection(hostId, "starting-host");
    try {
      await recoverSavedHost(savedHost, SshBootstrap);
      onRetry();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "VibePad Host startup failed.";
      setRecoveryError(message);
      reportComputerConnection(hostId, "offline", message);
    } finally {
      setStarting(false);
    }
  }, [hostId, onRetry, savedHost]);
  const handleRetry = useCallback(() => {
    startAndRetry().catch(() => undefined);
  }, [startAndRetry]);

  useEffect(() => {
    if (attempted.current || !savedHost?.automaticStart.enabled) {
      return;
    }
    attempted.current = true;
    startAndRetry().catch(() => undefined);
  }, [savedHost, startAndRetry]);
  useEffect(
    () =>
      subscribeToNearbyHosts(({ hosts }) => {
        const recovered = hosts.find((candidate) => candidate.id === hostId);
        const url = recovered?.endpoints[0];
        if (!url) {
          return;
        }
        update((current) => {
          const currentHost = current.connections.hosts.find(
            (candidate) => candidate.id === hostId
          );
          if (currentHost?.url === url) {
            return current;
          }
          return {
            ...current,
            connections: {
              ...current.connections,
              hosts: current.connections.hosts.map((candidate) =>
                candidate.id === hostId ? { ...candidate, url } : candidate
              ),
            },
          };
        });
      }),
    [hostId, update]
  );

  return (
    <View
      className="flex-1 items-center justify-center bg-background px-6 py-10"
      testID="host-connection-recovery"
    >
      <View className="w-full max-w-lg items-center gap-5">
        <View className="size-12 items-center justify-center rounded-xl bg-muted">
          <Icon className="text-muted-foreground" name="laptop" size={19} />
        </View>
        <View className="items-center gap-2">
          <Text className="text-center font-semibold text-xl">
            Reconnect to {hostName}
          </Text>
          <Text className="text-center text-sm leading-6" variant="muted">
            VibePad is looking for this computer on your private network and
            nearby LAN.
          </Text>
        </View>
        <View className="w-full rounded-lg bg-muted px-4 py-3">
          <Text className="text-center text-xs leading-5" variant="muted">
            {recoveryError ?? errorMessage}
          </Text>
        </View>
        <View className="flex-row flex-wrap items-center justify-center gap-3">
          <Button
            className="min-h-11"
            disabled={starting}
            onPress={handleRetry}
            testID="host-recovery-retry"
          >
            <Icon name="rotate-ccw" size={14} />
            <Text>{starting ? "Starting host" : "Try again"}</Text>
          </Button>
          <Button
            className="min-h-11"
            onPress={onOpenConnections}
            testID="host-recovery-connections"
            variant="outline"
          >
            <Icon name="settings" size={14} />
            <Text>Connection settings</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
