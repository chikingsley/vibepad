import { useColorScheme } from "nativewind";
import { useCallback, useState } from "react";
import { Platform, TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAppSettings } from "@/features/settings/settings-context";
import { THEME } from "@/lib/theme";
import { useVibePadHost } from "@/lib/vibepad-host-context";

const trailingSlash = /\/$/u;
const defaultDeviceName =
  Platform.select({
    android: "VibePad on Android",
    default: "VibePad device",
    ios: "VibePad on iPad",
    web: "VibePad Web",
  }) ?? "VibePad device";

const normalizedHostUrl = (value: string) => {
  const url = new URL(value.trim());
  if (!(url.protocol === "http:" || url.protocol === "https:")) {
    throw new Error("Host URL must use HTTP or HTTPS");
  }
  url.pathname = url.pathname.replace(trailingSlash, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(trailingSlash, "");
};

export function HostPairingControl() {
  const host = useVibePadHost();
  const { update } = useAppSettings();
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [hostUrl, setHostUrl] = useState("");
  const [open, setOpen] = useState(false);
  const [pairing, setPairing] = useState(false);

  const toggleOpen = useCallback(() => {
    setOpen((current) => !current);
    setErrorMessage(undefined);
  }, []);
  const pair = useCallback(async () => {
    if (pairing) {
      return;
    }
    setPairing(true);
    setErrorMessage(undefined);
    try {
      const url = normalizedHostUrl(hostUrl);
      const paired = await host.pair(url, {
        code: code.trim(),
        deviceName: deviceName.trim(),
      });
      update((current) => ({
        ...current,
        connections: {
          activeHostId: paired.hostId,
          hosts: [
            ...current.connections.hosts.filter(
              (candidate) => candidate.id !== paired.hostId
            ),
            { id: paired.hostId, name: paired.hostName, url },
          ],
        },
      }));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to pair this host"
      );
    } finally {
      setPairing(false);
    }
  }, [code, deviceName, host, hostUrl, pairing, update]);

  return (
    <View className="gap-3">
      <Button
        accessibilityLabel={open ? "Cancel adding host" : "Add host"}
        className="self-start"
        onPress={toggleOpen}
        size="sm"
        testID="host-pairing-open"
        variant="outline"
      >
        <Icon name={open ? "x" : "plus"} size={13} />
        <Text>{open ? "Cancel" : "Add host"}</Text>
      </Button>
      {open ? (
        <View
          className="gap-4 rounded-xl border border-border bg-card p-4"
          testID="host-pairing-form"
        >
          <View className="gap-1">
            <Text className="font-semibold text-sm">Pair a VibePad host</Text>
            <Text className="text-xs leading-5" variant="muted">
              Start the host, copy its short-lived pairing code, and enter the
              reachable HTTP or HTTPS address. The device token is returned once
              and stored separately from preferences.
            </Text>
          </View>
          <View className="gap-3 sm:flex-row">
            <View className="min-w-0 flex-1 gap-1.5">
              <Text className="font-medium text-xs">Host URL</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                className="h-10 rounded-lg border border-border bg-background px-3 text-foreground text-sm outline-none"
                keyboardType="url"
                onChangeText={setHostUrl}
                placeholder="http://100.x.y.z:4100"
                placeholderTextColor={theme.mutedForeground}
                style={{ color: theme.foreground }}
                testID="host-pairing-url"
                value={hostUrl}
              />
            </View>
            <View className="min-w-48 gap-1.5">
              <Text className="font-medium text-xs">Pairing code</Text>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                className="h-10 rounded-lg border border-border bg-background px-3 font-mono text-foreground text-sm outline-none"
                onChangeText={setCode}
                placeholder="XXXX-XXXX"
                placeholderTextColor={theme.mutedForeground}
                style={{ color: theme.foreground }}
                testID="host-pairing-code"
                value={code}
              />
            </View>
          </View>
          <View className="gap-1.5">
            <Text className="font-medium text-xs">Device name</Text>
            <TextInput
              autoCorrect={false}
              className="h-10 rounded-lg border border-border bg-background px-3 text-foreground text-sm outline-none"
              onChangeText={setDeviceName}
              placeholder="VibePad on iPad"
              placeholderTextColor={theme.mutedForeground}
              style={{ color: theme.foreground }}
              testID="host-pairing-device-name"
              value={deviceName}
            />
          </View>
          {errorMessage ? (
            <Text className="text-red-600 text-xs">{errorMessage}</Text>
          ) : null}
          <Button
            className="self-end"
            disabled={
              pairing ||
              hostUrl.trim().length === 0 ||
              code.trim().length < 8 ||
              deviceName.trim().length === 0
            }
            onPress={pair}
            size="sm"
            testID="host-pairing-submit"
          >
            <Text>{pairing ? "Pairing…" : "Pair and use host"}</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}

export function RevokeCurrentHostControl() {
  const host = useVibePadHost();
  const { settings, update } = useAppSettings();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [revoking, setRevoking] = useState(false);
  const isPaired = settings.connections.hosts.some(
    (candidate) => candidate.id === host.hostId
  );
  const revoke = useCallback(async () => {
    setRevoking(true);
    setErrorMessage(undefined);
    try {
      await host.revoke();
      update((current) => ({
        ...current,
        connections: {
          activeHostId:
            current.connections.activeHostId === host.hostId
              ? null
              : current.connections.activeHostId,
          hosts: current.connections.hosts.filter(
            (candidate) => candidate.id !== host.hostId
          ),
        },
      }));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to revoke this device"
      );
    } finally {
      setRevoking(false);
    }
  }, [host, update]);

  if (!isPaired) {
    return null;
  }
  return (
    <View className="items-end gap-1">
      <Button
        disabled={revoking}
        onPress={revoke}
        size="sm"
        testID="host-revoke-current"
        variant="destructive"
      >
        <Text>{revoking ? "Revoking…" : "Revoke this device"}</Text>
      </Button>
      {errorMessage ? (
        <Text className="max-w-64 text-right text-[10px] text-red-600">
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

function SavedHostRow({
  active,
  host,
  onSelect,
}: {
  readonly active: boolean;
  readonly host: {
    readonly id: string;
    readonly name: string;
    readonly url: string;
  };
  readonly onSelect: (hostId: string) => void;
}) {
  const select = useCallback(() => {
    onSelect(host.id);
  }, [host.id, onSelect]);

  return (
    <Button
      accessibilityLabel={`Use ${host.name} at ${host.url}`}
      className="h-auto min-h-12 justify-start px-3 py-2"
      onPress={select}
      testID={`saved-host-${host.id}`}
      variant={active ? "secondary" : "ghost"}
    >
      <Icon name="laptop" size={14} />
      <View className="min-w-0 flex-1 items-start">
        <Text className="font-medium text-xs">{host.name}</Text>
        <Text className="text-[10px]" numberOfLines={1} variant="muted">
          {host.url}
        </Text>
      </View>
      {active ? <Icon name="check" size={13} /> : null}
    </Button>
  );
}

export function SavedHostList() {
  const { settings, update } = useAppSettings();
  const select = useCallback(
    (hostId: string) => {
      update((current) => ({
        ...current,
        connections: { ...current.connections, activeHostId: hostId },
      }));
    },
    [update]
  );

  if (settings.connections.hosts.length === 0) {
    return (
      <Text className="text-xs" variant="muted">
        No paired hosts
      </Text>
    );
  }
  return (
    <View className="min-w-72 gap-1">
      {settings.connections.hosts.map((host) => (
        <SavedHostRow
          active={host.id === settings.connections.activeHostId}
          host={host}
          key={host.id}
          onSelect={select}
        />
      ))}
    </View>
  );
}
