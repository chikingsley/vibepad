import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { $TextInput } from "@legendapp/state/react-native";
import { useColorScheme } from "nativewind";
import { useCallback } from "react";
import { Platform, View } from "react-native";

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

interface PairingState {
  code: string;
  deviceName: string;
  errorMessage: string | undefined;
  hostUrl: string;
  open: boolean;
  pairing: boolean;
}

function PairingFields({
  state$,
  theme,
}: {
  readonly state$: Observable<PairingState>;
  readonly theme: (typeof THEME)[keyof typeof THEME];
}) {
  return (
    <>
      <View className="gap-3 sm:flex-row">
        <View className="min-w-0 flex-1 gap-1.5">
          <Text className="font-medium text-xs">Host URL</Text>
          <$TextInput
            $value={state$.hostUrl}
            autoCapitalize="none"
            autoCorrect={false}
            className="h-10 rounded-lg border border-border bg-background px-3 text-foreground text-sm outline-none"
            keyboardType="url"
            placeholder="http://100.x.y.z:4100"
            placeholderTextColor={theme.mutedForeground}
            style={{ color: theme.foreground }}
            testID="host-pairing-url"
          />
        </View>
        <View className="min-w-48 gap-1.5">
          <Text className="font-medium text-xs">Pairing code</Text>
          <$TextInput
            $value={state$.code}
            autoCapitalize="characters"
            autoCorrect={false}
            className="h-10 rounded-lg border border-border bg-background px-3 font-mono text-foreground text-sm outline-none"
            placeholder="XXXX-XXXX"
            placeholderTextColor={theme.mutedForeground}
            style={{ color: theme.foreground }}
            testID="host-pairing-code"
          />
        </View>
      </View>
      <View className="gap-1.5">
        <Text className="font-medium text-xs">Device name</Text>
        <$TextInput
          $value={state$.deviceName}
          autoCorrect={false}
          className="h-10 rounded-lg border border-border bg-background px-3 text-foreground text-sm outline-none"
          placeholder="VibePad on iPad"
          placeholderTextColor={theme.mutedForeground}
          style={{ color: theme.foreground }}
          testID="host-pairing-device-name"
        />
      </View>
    </>
  );
}

function PairingError({
  state$,
}: {
  readonly state$: Observable<PairingState>;
}) {
  const errorMessage = useValue(state$.errorMessage);
  return errorMessage ? (
    <Text className="text-red-600 text-xs">{errorMessage}</Text>
  ) : null;
}

function PairingSubmit({
  onPress,
  state$,
}: {
  readonly onPress: () => void;
  readonly state$: Observable<PairingState>;
}) {
  const code = useValue(state$.code);
  const deviceName = useValue(state$.deviceName);
  const hostUrl = useValue(state$.hostUrl);
  const pairing = useValue(state$.pairing);

  return (
    <Button
      className="self-end"
      disabled={
        pairing ||
        hostUrl.trim().length === 0 ||
        code.trim().length < 8 ||
        deviceName.trim().length === 0
      }
      onPress={onPress}
      size="sm"
      testID="host-pairing-submit"
    >
      <Text>{pairing ? "Pairing…" : "Pair and use host"}</Text>
    </Button>
  );
}

export function HostPairingControl() {
  const host = useVibePadHost();
  const workspace = useVibePadWorkspaceStore();
  const { update } = useAppSettingsStore();
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const state$ = useObservable<PairingState>({
    code: "",
    deviceName: defaultDeviceName,
    errorMessage: undefined,
    hostUrl: "",
    open: false,
    pairing: false,
  });
  const open = useValue(state$.open);

  const toggleOpen = useCallback(() => {
    state$.open.set((current) => !current);
    state$.errorMessage.set(undefined);
  }, [state$]);
  const pair = useCallback(async () => {
    if (state$.pairing.peek()) {
      return;
    }
    state$.pairing.set(true);
    state$.errorMessage.set(undefined);
    try {
      const url = normalizedHostUrl(state$.hostUrl.peek());
      const paired = await host.pair(url, {
        code: state$.code.peek().trim(),
        deviceName: state$.deviceName.peek().trim(),
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
      state$.code.set("");
      state$.open.set(false);
      if (paired.hostId === host.hostId && url === host.baseUrl) {
        await workspace.refresh();
      }
    } catch (error) {
      state$.errorMessage.set(
        error instanceof Error ? error.message : "Unable to pair this host"
      );
    } finally {
      state$.pairing.set(false);
    }
  }, [host, state$, update, workspace]);

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
          <PairingFields state$={state$} theme={theme} />
          <PairingError state$={state$} />
          <PairingSubmit onPress={pair} state$={state$} />
        </View>
      ) : null}
    </View>
  );
}

export function RevokeCurrentHostControl() {
  const host = useVibePadHost();
  const { update } = useAppSettingsStore();
  const operation$ = useObservable({
    errorMessage: undefined as string | undefined,
    revoking: false,
  });
  const { errorMessage, revoking } = useValue(operation$);
  const isPaired = useSettingsValue((state$) =>
    state$.settings.connections.hosts
      .get()
      .some((candidate) => candidate.id === host.hostId)
  );
  const revoke = useCallback(async () => {
    if (operation$.revoking.peek()) {
      return;
    }
    operation$.assign({ errorMessage: undefined, revoking: true });
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
      operation$.errorMessage.set(
        error instanceof Error ? error.message : "Unable to revoke this device"
      );
    } finally {
      operation$.revoking.set(false);
    }
  }, [host, operation$, update]);

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

  if (connections.hosts.length === 0) {
    return (
      <Text className="text-xs" variant="muted">
        No paired hosts
      </Text>
    );
  }
  return (
    <View className="min-w-72 gap-1">
      {connections.hosts.map((host) => (
        <SavedHostRow
          active={host.id === connections.activeHostId}
          host={host}
          key={host.id}
          onSelect={select}
        />
      ))}
    </View>
  );
}
