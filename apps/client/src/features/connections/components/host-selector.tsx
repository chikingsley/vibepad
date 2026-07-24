import type { HostProfile } from "@vibepad/protocol/settings";
import { useCallback } from "react";
import { Pressable, Switch, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  computerStatusDotClass,
  computerStatusLabel,
  useComputerConnectionStatus,
} from "@/features/connections/state/computer-connections";
import { useAppSettingsStore } from "@/features/settings/settings-context";
import { cn } from "@/lib/utils";

/**
 * The one "set active host" mutation. Every surface that switches computers
 * (sidebar chip strip, settings saved-host list) goes through this helper.
 */
export const useSetActiveHost = () => {
  const { update } = useAppSettingsStore();
  return useCallback(
    (hostId: string) => {
      update((current) => ({
        ...current,
        connections: { ...current.connections, activeHostId: hostId },
      }));
    },
    [update]
  );
};

export type HostSelectorVariant = "chip" | "row";

function HostSelectorChip({
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

function HostSelectorRow({
  active,
  host,
  onSelect,
  onToggleAutomaticStart,
}: {
  readonly active: boolean;
  readonly host: HostProfile;
  readonly onSelect: (hostId: string) => void;
  readonly onToggleAutomaticStart?:
    | ((hostId: string, enabled: boolean) => void)
    | undefined;
}) {
  const select = useCallback(() => onSelect(host.id), [host.id, onSelect]);
  const toggleAutomaticStart = useCallback(
    (enabled: boolean) => onToggleAutomaticStart?.(host.id, enabled),
    [host.id, onToggleAutomaticStart]
  );
  const status = useComputerConnectionStatus(host.id);
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
        <View className="flex-row items-center gap-2">
          <View
            className={cn(
              "size-2 shrink-0 rounded-full",
              computerStatusDotClass(status)
            )}
            testID={`saved-host-status-${host.id}`}
          />
          <Text className="min-w-0 font-medium text-sm" numberOfLines={1}>
            {host.name}
          </Text>
        </View>
        <Text className="text-xs" variant="muted">
          {detail}
        </Text>
      </View>
      {automaticStartAvailable && onToggleAutomaticStart ? (
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

/**
 * The one presentational host selector. The sidebar strip renders it as a
 * "chip"; the settings saved-host list renders it as a "row". Both share the
 * connection-status dot source and the set-active-host mutation.
 */
export function HostSelectorItem({
  active,
  host,
  onSelect,
  onToggleAutomaticStart,
  variant,
}: {
  readonly active: boolean;
  readonly host: HostProfile;
  readonly onSelect: (hostId: string) => void;
  readonly onToggleAutomaticStart?:
    | ((hostId: string, enabled: boolean) => void)
    | undefined;
  readonly variant: HostSelectorVariant;
}) {
  if (variant === "chip") {
    return <HostSelectorChip active={active} host={host} onSelect={onSelect} />;
  }
  return (
    <HostSelectorRow
      active={active}
      host={host}
      onSelect={onSelect}
      onToggleAutomaticStart={onToggleAutomaticStart}
    />
  );
}
