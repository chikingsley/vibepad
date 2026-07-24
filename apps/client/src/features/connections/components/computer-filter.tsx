import type { HostProfile } from "@vibepad/protocol/settings";
import { useCallback, useEffect } from "react";
import { AppState, Pressable, ScrollView, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { runSavedComputerChecks } from "@/features/connections/computer-connection-checks";
import {
  computerStatusDotClass,
  computerStatusLabel,
  useComputerConnectionStatus,
} from "@/features/connections/state/computer-connections";
import {
  useAppSettingsStore,
  useSettingsValue,
} from "@/features/settings/settings-context";
import { cn } from "@/lib/utils";

function ComputerChip({
  active,
  host,
  onSelect,
}: {
  readonly active: boolean;
  readonly host: HostProfile;
  readonly onSelect: (hostId: string) => void;
}) {
  const select = useCallback(() => onSelect(host.id), [host.id, onSelect]);
  const status = useComputerConnectionStatus(host.id);
  const statusLabel = computerStatusLabel(status);
  return (
    <Pressable
      accessibilityLabel={
        statusLabel ? `Use ${host.name}, ${statusLabel}` : `Use ${host.name}`
      }
      accessibilityState={{ selected: active }}
      className={cn(
        "min-h-9 flex-row items-center gap-2 rounded-full border px-3",
        active ? "border-foreground bg-foreground" : "border-border bg-muted/60"
      )}
      onPress={select}
      testID={`computer-filter-${host.id}`}
    >
      <View
        className={cn("size-2 rounded-full", computerStatusDotClass(status))}
        testID={`computer-status-${host.id}`}
      />
      <Icon
        className={active ? "text-background" : "text-foreground"}
        name="laptop"
        size={14}
      />
      <Text
        className={cn("font-medium text-xs", active && "text-background")}
        numberOfLines={1}
      >
        {host.name}
      </Text>
    </Pressable>
  );
}

export function ComputerFilter() {
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

  useEffect(() => {
    runSavedComputerChecks(connections.hosts, connections.activeHostId).catch(
      () => undefined
    );
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runSavedComputerChecks(
          connections.hosts,
          connections.activeHostId
        ).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [connections.activeHostId, connections.hosts]);

  return (
    <ScrollView
      className="max-h-12"
      contentContainerClassName="gap-2 px-3 py-1.5"
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="computer-filter"
    >
      {connections.hosts.map((host) => (
        <ComputerChip
          active={host.id === connections.activeHostId}
          host={host}
          key={host.id}
          onSelect={select}
        />
      ))}
    </ScrollView>
  );
}
