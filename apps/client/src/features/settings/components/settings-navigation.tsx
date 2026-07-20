import { appSettingsSchemaVersion } from "@vibepad/protocol/settings";
import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { Icon, type IconName } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { SettingsPage } from "@/features/settings/settings-page";
import { cn } from "@/lib/utils";

const settingsPages: readonly {
  readonly icon: IconName;
  readonly id: SettingsPage;
  readonly label: string;
}[] = [
  { icon: "message-square", id: "timeline", label: "Timeline" },
  { icon: "mic", id: "voice", label: "Voice" },
  { icon: "laptop", id: "connections", label: "Connections" },
];

function SettingsNavigationItem({
  compact,
  onSelect,
  page,
  selected,
}: {
  readonly compact: boolean;
  readonly onSelect: (page: SettingsPage) => void;
  readonly page: (typeof settingsPages)[number];
  readonly selected: boolean;
}) {
  const select = useCallback(() => {
    onSelect(page.id);
  }, [onSelect, page.id]);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      aria-selected={selected}
      className={cn(
        "min-h-10 flex-row items-center gap-2 rounded-lg px-3 active:bg-accent",
        compact && "flex-1 justify-center",
        selected && "bg-accent"
      )}
      onPress={select}
      testID={`settings-page-${page.id}`}
    >
      <Icon
        className={
          selected ? "text-accent-foreground" : "text-muted-foreground"
        }
        name={page.icon}
        size={15}
      />
      <Text className="font-medium text-xs">{page.label}</Text>
    </Pressable>
  );
}

export function SettingsNavigation({
  compact,
  onSelect,
  selected,
}: {
  readonly compact: boolean;
  readonly onSelect: (page: SettingsPage) => void;
  readonly selected: SettingsPage;
}) {
  return (
    <View
      className={cn(
        "border-border bg-muted/35 p-3",
        compact ? "border-b" : "w-52 border-r"
      )}
    >
      <Text
        className="px-2 pb-2 font-medium text-[10px] uppercase tracking-widest"
        variant="muted"
      >
        VibePad
      </Text>
      <View className={cn("gap-1", compact && "flex-row")}>
        {settingsPages.map((page) => (
          <SettingsNavigationItem
            compact={compact}
            key={page.id}
            onSelect={onSelect}
            page={page}
            selected={page.id === selected}
          />
        ))}
      </View>
      {compact ? null : (
        <Text className="mt-auto px-2 pt-6 text-[10px]" variant="muted">
          Preferences schema v{appSettingsSchemaVersion}
        </Text>
      )}
    </View>
  );
}
