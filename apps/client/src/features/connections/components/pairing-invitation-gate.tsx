import { decodePairingInvitationUrl } from "@vibepad/protocol/auth";
import { useURL } from "expo-linking";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAppSettingsStore } from "@/features/settings/settings-context";
import {
  useVibePadHost,
  useVibePadWorkspaceStore,
} from "@/lib/vibepad-host-context";

import { pairHostInvitation } from "../pair-host";
import { connectionsWithPairedHost } from "../pairing-invitation";

interface InvitationPairingState {
  readonly errorMessage?: string;
  readonly hostName?: string;
  readonly status: "error" | "idle" | "pairing";
}

const idleState: InvitationPairingState = { status: "idle" };

// Pairing an invitation remounts the host provider subtree, so consumed URLs
// are tracked outside the component to keep a one-use code from being redeemed
// twice.
const processedInvitationUrls = new Set<string>();

export function PairingInvitationGate({
  children,
}: {
  readonly children: ReactNode;
}) {
  const host = useVibePadHost();
  const workspace = useVibePadWorkspaceStore();
  const { update } = useAppSettingsStore();
  const incomingUrl = useURL();
  const [pairingState, setPairingState] =
    useState<InvitationPairingState>(idleState);

  useEffect(() => {
    if (!incomingUrl || processedInvitationUrls.has(incomingUrl)) {
      return;
    }
    const invitation = decodePairingInvitationUrl(incomingUrl);
    if (!invitation) {
      return;
    }
    processedInvitationUrls.add(incomingUrl);
    setPairingState({ hostName: invitation.hostName, status: "pairing" });
    (async () => {
      try {
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
        setPairingState(idleState);
        if (paired.hostId === host.hostId && endpoint === host.baseUrl) {
          await workspace.refresh();
        }
      } catch (error) {
        setPairingState({
          errorMessage:
            error instanceof Error
              ? error.message
              : "VibePad could not redeem this pairing invitation",
          hostName: invitation.hostName,
          status: "error",
        });
      }
    })().catch(() => undefined);
  }, [host, incomingUrl, update, workspace]);

  const dismiss = useCallback(() => setPairingState(idleState), []);

  return (
    <View className="flex-1">
      {children}
      {pairingState.status === "idle" ? null : (
        <View
          className="border-border bg-card absolute inset-x-4 top-4 flex-row items-center gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-black/20"
          testID="pairing-invitation-banner"
        >
          <Icon
            className={
              pairingState.status === "error"
                ? "text-red-600"
                : "text-muted-foreground"
            }
            name={pairingState.status === "error" ? "x" : "search"}
            size={16}
          />
          <Text className="min-w-0 flex-1 text-sm" numberOfLines={2}>
            {pairingState.status === "pairing"
              ? `Connecting to ${pairingState.hostName ?? "your computer"}…`
              : pairingState.errorMessage}
          </Text>
          {pairingState.status === "error" ? (
            <Pressable
              accessibilityLabel="Dismiss pairing message"
              onPress={dismiss}
              testID="pairing-invitation-dismiss"
            >
              <Text className="text-sm" variant="muted">
                Dismiss
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}
