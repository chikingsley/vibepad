import type { SshTarget } from "@vibepad/protocol/remote";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAppSettingsStore } from "@/features/settings/settings-context";
import { useVibePadHost } from "@/lib/vibepad-host-context";
import { pairHostInvitation } from "../pair-host";
import { connectionsWithPairedHost } from "../pairing-invitation";

function SshTargetRow({
  busy,
  onSetup,
  target,
}: {
  readonly busy: boolean;
  readonly onSetup: (target: SshTarget) => void;
  readonly target: SshTarget;
}) {
  const setup = useCallback(() => onSetup(target), [onSetup, target]);
  return (
    <View
      className="flex-row items-center gap-3 border-border border-b px-4 py-3 last:border-b-0"
      testID={`ssh-target-${target.alias}`}
    >
      <View className="size-9 items-center justify-center rounded-lg bg-muted">
        <Icon className="text-muted-foreground" name="laptop" size={15} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-medium text-sm">{target.alias}</Text>
        <Text className="text-xs" variant="muted">
          {target.user}@{target.hostName}
        </Text>
      </View>
      <Button
        disabled={busy}
        onPress={setup}
        size="sm"
        testID={`ssh-setup-${target.alias}`}
        variant="outline"
      >
        <Text>{busy ? "Setting up…" : "Set up"}</Text>
      </Button>
    </View>
  );
}

export function SshComputerSetup() {
  const host = useVibePadHost();
  const { update } = useAppSettingsStore();
  const [targets, setTargets] = useState<readonly SshTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAlias, setBusyAlias] = useState<string>();
  const [message, setMessage] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(undefined);
    try {
      setTargets(await host.listSshTargets());
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "SSH discovery failed"
      );
    } finally {
      setLoading(false);
    }
  }, [host]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const setup = useCallback(
    async (target: SshTarget) => {
      setBusyAlias(target.alias);
      setMessage(`Installing VibePad Host on ${target.alias}…`);
      try {
        const invitation = await host.bootstrapSshTarget(target.alias);
        setMessage(`Pairing ${invitation.hostName}…`);
        const { endpoint, paired } = await pairHostInvitation(
          host,
          invitation.endpoints,
          invitation.code
        );
        update((current) => ({
          ...current,
          connections: connectionsWithPairedHost(
            current.connections,
            paired,
            endpoint
          ),
        }));
        setMessage(`${paired.hostName} is ready`);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Computer setup failed"
        );
      } finally {
        setBusyAlias(undefined);
      }
    },
    [host, update]
  );

  if (loading) {
    return (
      <View className="flex-row items-center gap-2 py-2" testID="ssh-loading">
        <Icon className="text-muted-foreground" name="search" size={14} />
        <Text className="text-sm" variant="muted">
          Finding computers from SSH…
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3" testID="ssh-computer-setup">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-medium text-sm">
          Computers available through SSH
        </Text>
        <Button onPress={load} size="icon" testID="ssh-refresh" variant="ghost">
          <Icon name="rotate-ccw" size={14} />
        </Button>
      </View>
      {targets.length > 0 ? (
        <View className="overflow-hidden rounded-xl border border-border bg-card">
          {targets.map((target) => (
            <SshTargetRow
              busy={busyAlias === target.alias}
              key={target.alias}
              onSetup={setup}
              target={target}
            />
          ))}
        </View>
      ) : (
        <Text className="text-sm leading-5" variant="muted">
          Add a concrete Host entry to the controller&apos;s SSH config, then
          refresh.
        </Text>
      )}
      {message ? (
        <Text className="text-xs leading-5" variant="muted">
          {message}
        </Text>
      ) : null}
    </View>
  );
}
