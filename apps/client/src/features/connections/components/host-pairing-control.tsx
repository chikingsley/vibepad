import { useCallback, useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  HostSelectorItem,
  useSetActiveHost,
} from "@/features/connections/components/host-selector";
import { PairingCodeForm } from "@/features/connections/components/pairing-code-form";
import {
  useAppSettingsStore,
  useSettingsValue,
} from "@/features/settings/settings-context";

export function HostPairingControl({
  alwaysOpen = false,
}: {
  readonly alwaysOpen?: boolean;
}) {
  const [open, setOpen] = useState(alwaysOpen);

  const toggleOpen = useCallback(() => {
    setOpen((current) => !current);
  }, []);
  const closeAfterPairing = useCallback(
    () => setOpen(alwaysOpen),
    [alwaysOpen]
  );

  return (
    <View className="gap-3">
      {alwaysOpen ? null : (
        <Button
          accessibilityLabel={open ? "Cancel pairing" : "Pair another computer"}
          className="min-h-12 self-start"
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
          <PairingCodeForm
            codeFieldTestID="host-pairing-code"
            onPersisted={closeAfterPairing}
            submitTestID="host-pairing-submit"
          />
        </View>
      ) : null}
    </View>
  );
}

export function SavedHostList() {
  const { update } = useAppSettingsStore();
  const connections = useSettingsValue((state$) =>
    state$.settings.connections.get()
  );
  const setActiveHost = useSetActiveHost();
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
        <HostSelectorItem
          active={savedHost.id === connections.activeHostId}
          host={savedHost}
          key={savedHost.id}
          onSelect={setActiveHost}
          onToggleAutomaticStart={toggleAutomaticStart}
          variant="row"
        />
      ))}
    </View>
  );
}
