import type { Observable } from "@legendapp/state";
import { $TextInput } from "@legendapp/state/react-native";
import { useColorScheme } from "nativewind";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { THEME } from "@/lib/theme";

export function ObservableSearchField({
  placeholder,
  query$,
  testID,
}: {
  readonly placeholder: string;
  readonly query$: Observable<string>;
  readonly testID: string;
}) {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View className="flex-row items-center gap-2 rounded-lg border border-border px-3">
      <Icon className="text-muted-foreground" name="search" size={13} />
      <$TextInput
        $value={query$}
        autoCapitalize="none"
        autoCorrect={false}
        className="h-10 min-w-0 flex-1 text-foreground text-sm outline-none"
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        style={{ color: theme.foreground }}
        testID={testID}
      />
    </View>
  );
}
