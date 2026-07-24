import type { HostProfile } from "@vibepad/protocol/settings";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useState } from "react";
import { Switch, TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useAppSettingsStore,
  useSettingsValue,
} from "@/features/settings/settings-context";
import { THEME } from "@/lib/theme";
import {
  useVibePadHost,
  useVibePadWorkspaceStore,
} from "@/lib/vibepad-host-context";

import {
  type NearbyHostDiscoveryState,
  subscribeToNearbyHosts,
} from "../nearby-host-discovery";
import { pairHostInvitation } from "../pair-host";
import { connectionsWithPairedHost } from "../pairing-invitation";

const emptyDiscovery: NearbyHostDiscoveryState = { hosts: [] };

const discoveryStatus = (discovery: NearbyHostDiscoveryState) => {
  if (discovery.hosts.length === 1) {
    return `Found ${discovery.hosts[0]?.name}`;
  }
  if (discovery.hosts.length > 1) {
    return `Found ${discovery.hosts.length} nearby hosts`;
  }
  return "Looking for VibePad Host nearby…";
};

export function HostPairingControl({
  alwaysOpen = false,
}: {
  readonly alwaysOpen?: boolean;
}) {
  const host = useVibePadHost();
  const workspace = useVibePadWorkspaceStore();
  const { update } = useAppSettingsStore();
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const [code, setCode] = useState("");
  const [discovery, setDiscovery] =
    useState<NearbyHostDiscoveryState>(emptyDiscovery);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [open, setOpen] = useState(alwaysOpen);
  const [pairing, setPairing] = useState(false);

  useEffect(() => subscribeToNearbyHosts(setDiscovery), []);

  const pair = useCallback(async () => {
    if (pairing) {
      return;
    }
    const endpoints = [
      ...new Set(discovery.hosts.flatMap((nearbyHost) => nearbyHost.endpoints)),
    ];
    if (endpoints.length === 0) {
      setErrorMessage(
        "VibePad is still looking for a host nearby. Keep both devices on the same network or scan the host QR code."
      );
      return;
    }
    setPairing(true);
    setErrorMessage(undefined);
    try {
      const { endpoint, paired } = await pairHostInvitation(
        host,
        endpoints,
        code.trim()
      );
      update((current) => ({
        ...current,
        connections: connectionsWithPairedHost(
          current.connections,
          paired,
          endpoint
        ),
      }));
      setCode("");
      setOpen(alwaysOpen);
      if (paired.hostId === host.hostId && endpoint === host.baseUrl) {
        await workspace.refresh();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "VibePad could not redeem this pairing code"
      );
    } finally {
      setPairing(false);
    }
  }, [alwaysOpen, code, discovery.hosts, host, pairing, update, workspace]);

  const toggleOpen = useCallback(() => {
    setOpen((current) => !current);
    setErrorMessage(undefined);
  }, []);
  const submit = useCallback(() => {
    pair().catch(() => undefined);
  }, [pair]);
  const discoveryLabel = discoveryStatus(discovery);

  return (
    <View className="gap-3">
      {alwaysOpen ? null : (
        <Button
          accessibilityLabel={open ? "Cancel pairing" : "Pair another computer"}
          className="min-h-11 self-start"
          onPress={toggleOpen}
          testID="host-pairing-open"
          variant="outline"
        >
          <Icon name={open ? "x" : "plus"} size={14} />
          <Text>{open ? "Cancel" : "Pair another computer"}</Text>
        </Button>
      )}
      {open ? (
        <View
          className="gap-4 rounded-xl border border-border bg-card p-4"
          testID="host-pairing-form"
        >
          <Text className="text-sm leading-6" variant="muted">
            Run VibePad Host on your computer. Enter the code it shows, or scan
            its QR code with Camera.
          </Text>
          <View className="flex-row items-center gap-2">
            <Icon
              className="text-muted-foreground"
              name={discovery.hosts.length > 0 ? "check" : "search"}
              size={14}
            />
            <Text className="text-xs" variant="muted">
              {discoveryLabel}
            </Text>
          </View>
          <View className="gap-1.5">
            <Text className="font-medium text-sm">Pairing code</Text>
            <View className="gap-3 sm:flex-row">
              <TextInput
                accessibilityLabel="Pairing code"
                autoCapitalize="characters"
                autoCorrect={false}
                className="h-12 min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-3 font-mono text-base text-foreground outline-none"
                enterKeyHint="go"
                onChangeText={setCode}
                onSubmitEditing={submit}
                placeholder="XXXX-XXXX"
                placeholderTextColor={theme.mutedForeground}
                selectionColor={theme.primary}
                style={{ color: theme.foreground }}
                submitBehavior="blurAndSubmit"
                testID="host-pairing-code"
                value={code}
              />
              <Button
                className="min-h-12"
                disabled={pairing || code.trim().length < 8}
                onPress={submit}
                testID="host-pairing-submit"
              >
                <Text>{pairing ? "Connecting…" : "Connect"}</Text>
              </Button>
            </View>
          </View>
          {errorMessage ? (
            <Text className="text-red-600 text-xs leading-5">
              {errorMessage}
            </Text>
          ) : null}
          {discovery.errorMessage ? (
            <Text className="text-xs" variant="muted">
              Nearby discovery needs local-network access. QR pairing remains
              available.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function SavedHostRow({
  active,
  host,
  onSelect,
  onToggleAutomaticStart,
}: {
  readonly active: boolean;
  readonly host: HostProfile;
  readonly onSelect: (hostId: string) => void;
  readonly onToggleAutomaticStart: (hostId: string, enabled: boolean) => void;
}) {
  const select = useCallback(() => onSelect(host.id), [host.id, onSelect]);
  const toggleAutomaticStart = useCallback(
    (enabled: boolean) => onToggleAutomaticStart(host.id, enabled),
    [host.id, onToggleAutomaticStart]
  );
  const automaticStartAvailable = Boolean(
    host.automaticStart.recoveryKeyId && host.automaticStart.ssh
  );
  let detail = active ? "Connected computer" : "Saved computer";
  if (automaticStartAvailable && host.automaticStart.enabled) {
    detail = "Starts when VibePad opens";
  }
  return (
    <View
      className="flex-row items-center gap-3 border-border border-b px-4 py-4 last:border-b-0"
      testID={`saved-host-${host.id}`}
    >
      <View className="size-10 items-center justify-center rounded-lg bg-muted">
        <Icon className="text-muted-foreground" name="laptop" size={16} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-medium text-sm">{host.name}</Text>
        <Text className="text-xs" variant="muted">
          {detail}
        </Text>
      </View>
      {automaticStartAvailable ? (
        <Switch
          accessibilityLabel={`Start ${host.name} when VibePad opens`}
          onValueChange={toggleAutomaticStart}
          testID={`saved-host-automatic-start-${host.id}`}
          value={host.automaticStart.enabled}
        />
      ) : null}
      {active ? (
        <View className="flex-row items-center gap-1 px-2">
          <Icon className="text-muted-foreground" name="check" size={13} />
          <Text className="text-xs" variant="muted">
            Active
          </Text>
        </View>
      ) : (
        <Button onPress={select} size="sm" variant="outline">
          <Text>Use</Text>
        </Button>
      )}
    </View>
  );
}

export function SavedHostList() {
  const { update } = useAppSettingsStore();
  const connections = useSettingsValue((state$) =>
    state$.settings.connections.get()
  );
  const select = useCallback(
    (hostId: string) => {
      update((current) => ({
        ...current,
        connections: { ...current.connections, activeHostId: hostId },
      }));
    },
    [update]
  );
  const toggleAutomaticStart = useCallback(
    (hostId: string, enabled: boolean) => {
      update((current) => ({
        ...current,
        connections: {
          ...current.connections,
          hosts: current.connections.hosts.map((host) =>
            host.id === hostId
              ? {
                  ...host,
                  automaticStart: { ...host.automaticStart, enabled },
                }
              : host
          ),
        },
      }));
    },
    [update]
  );

  if (connections.hosts.length === 0) {
    return null;
  }
  return (
    <View className="overflow-hidden rounded-xl border border-border bg-card">
      {connections.hosts.map((savedHost) => (
        <SavedHostRow
          active={savedHost.id === connections.activeHostId}
          host={savedHost}
          key={savedHost.id}
          onSelect={select}
          onToggleAutomaticStart={toggleAutomaticStart}
        />
      ))}
    </View>
  );
}
