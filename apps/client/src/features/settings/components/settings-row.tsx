import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";

export function SettingsRow({
  children,
  description,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <View className="gap-4 border-border border-b px-4 py-4 last:border-b-0 sm:flex-row sm:items-center">
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-medium text-sm">{title}</Text>
        <Text className="max-w-xl text-xs leading-5" variant="muted">
          {description}
        </Text>
      </View>
      <View className="shrink-0">{children}</View>
    </View>
  );
}

export function SettingsList({ children }: { readonly children: ReactNode }) {
  return (
    <View className="overflow-hidden rounded-xl border border-border bg-card">
      {children}
    </View>
  );
}
