import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useState } from "react";
import { TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAppSettingsStore } from "@/features/settings/settings-context";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
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

export interface PairedHostResult {
  readonly endpoint: string;
  readonly paired: { readonly hostId: string; readonly hostName: string };
}

export interface PairingTarget {
  readonly endpoints: readonly string[];
  readonly id: string;
  readonly name: string;
}

const emptyDiscovery: NearbyHostDiscoveryState = { hosts: [] };

const discoveryStatus = (
  discovery: NearbyHostDiscoveryState,
  computer: PairingTarget | undefined
) => {
  if (computer) {
    return discovery.hosts.some((nearbyHost) => nearbyHost.id === computer.id)
      ? "VibePad Host is running and ready."
      : `Looking for ${computer.name} nearby…`;
  }
  if (discovery.hosts.length === 1) {
    return `Found ${discovery.hosts[0]?.name}`;
  }
  if (discovery.hosts.length > 1) {
    return `Found ${discovery.hosts.length} nearby hosts`;
  }
  return "Looking for VibePad Host nearby…";
};

/**
 * The one manual pairing-code form: code field, nearby-discovery status, and
 * connect button. Onboarding pair-existing and settings pairing both render
 * it, so there is a single subscribeToNearbyHosts consumer per mount and a
 * single pairHostInvitation call path.
 *
 * Without `onPaired` the form persists the paired host itself through
 * connectionsWithPairedHost (settings). With `onPaired` the caller owns
 * persistence timing — onboarding defers the same connectionsWithPairedHost
 * write until its ready screen finishes.
 */
export function PairingCodeForm({
  codeFieldTestID,
  computer,
  layout = "inline",
  onPaired,
  onPersisted,
  submitTestID,
}: {
  readonly codeFieldTestID: string;
  readonly computer?: PairingTarget | undefined;
  readonly layout?: "inline" | "stacked";
  readonly onPaired?: ((result: PairedHostResult) => void) | undefined;
  readonly onPersisted?: (() => void) | undefined;
  readonly submitTestID: string;
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
  const [pairing, setPairing] = useState(false);

  useEffect(() => subscribeToNearbyHosts(setDiscovery), []);

  const pair = useCallback(async () => {
    if (pairing) {
      return;
    }
    const endpoints = computer
      ? computer.endpoints
      : [
          ...new Set(
            discovery.hosts.flatMap((nearbyHost) => nearbyHost.endpoints)
          ),
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
      const result = await pairHostInvitation(host, endpoints, code.trim());
      setCode("");
      if (onPaired) {
        onPaired(result);
        return;
      }
      update((current) => ({
        ...current,
        connections: connectionsWithPairedHost(
          current.connections,
          result.paired,
          result.endpoint
        ),
      }));
      if (
        result.paired.hostId === host.hostId &&
        result.endpoint === host.baseUrl
      ) {
        await workspace.refresh();
      }
      onPersisted?.();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "VibePad could not redeem this pairing code"
      );
    } finally {
      setPairing(false);
    }
  }, [
    code,
    computer,
    discovery.hosts,
    host,
    onPaired,
    onPersisted,
    pairing,
    update,
    workspace,
  ]);

  const submit = useCallback(() => {
    pair().catch(() => undefined);
  }, [pair]);
  const stacked = layout === "stacked";
  const submitDisabled = pairing || code.trim().length < 8;
  let submitLabel = stacked ? "Pair" : "Connect";
  if (pairing) {
    submitLabel = "Connecting…";
  }
  const targetVisible = computer
    ? discovery.hosts.some((nearbyHost) => nearbyHost.id === computer.id)
    : discovery.hosts.length > 0;

  return (
    <View className="gap-4">
      <View
        className={cn(
          "flex-row items-center gap-2",
          stacked && "justify-center"
        )}
      >
        <Icon
          className="text-muted-foreground"
          name={targetVisible ? "check" : "search"}
          size={14}
        />
        <Text className="text-xs" variant="muted">
          {discoveryStatus(discovery, computer)}
        </Text>
      </View>
      <View className="gap-1.5">
        {stacked ? null : (
          <Text className="text-sm font-medium">Pairing code</Text>
        )}
        <View className={cn("gap-3", !stacked && "sm:flex-row")}>
          <TextInput
            accessibilityLabel="Pairing code"
            autoCapitalize="characters"
            autoCorrect={false}
            className={cn(
              "border-border text-foreground min-w-0 rounded-xl border font-mono outline-none",
              stacked
                ? "bg-card h-14 px-4 text-center text-lg"
                : "bg-muted/40 h-12 flex-1 px-3 text-base"
            )}
            enterKeyHint="go"
            onChangeText={setCode}
            onSubmitEditing={submit}
            placeholder="XXXX-XXXX"
            placeholderTextColor={theme.mutedForeground}
            selectionColor={theme.primary}
            style={{ color: theme.foreground }}
            submitBehavior="blurAndSubmit"
            testID={codeFieldTestID}
            value={code}
          />
          <Button
            className={cn("min-h-12", stacked && "rounded-xl")}
            disabled={submitDisabled}
            onPress={submit}
            testID={submitTestID}
          >
            <Text>{submitLabel}</Text>
          </Button>
        </View>
      </View>
      {errorMessage ? (
        <Text
          className={cn(
            "text-xs leading-5 text-red-600",
            stacked && "text-center text-sm"
          )}
        >
          {errorMessage}
        </Text>
      ) : null}
      {discovery.errorMessage ? (
        <Text
          className={cn("text-xs", stacked && "text-center")}
          variant="muted"
        >
          Nearby discovery needs local-network access. QR pairing remains
          available.
        </Text>
      ) : null}
    </View>
  );
}
