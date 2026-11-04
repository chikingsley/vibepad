import MaskedViewBase from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import type { ComponentType, ReactElement } from "react";
import type { ViewProps } from "react-native";

import { Text } from "@/components/ui/text";

// The package's types extend NativeMethods, which React Native 0.88 no longer
// exports. Runtime behavior is unchanged, so only the declared type is restated.
const MaskedView = MaskedViewBase as unknown as ComponentType<
  ViewProps & { readonly maskElement: ReactElement }
>;

export function SessionTitle({
  fill = true,
  title,
}: {
  readonly fill?: boolean;
  readonly title: string;
}) {
  return (
    <MaskedView
      maskElement={
        <LinearGradient
          colors={["#000000", "#000000", "transparent"]}
          locations={[0, 0.82, 1]}
          style={{ flex: 1 }}
        />
      }
      style={
        fill
          ? { flex: 1, minWidth: 0 }
          : { flexShrink: 1, maxWidth: "70%", minWidth: 0 }
      }
    >
      <Text ellipsizeMode="clip" numberOfLines={1} variant="sessionTitle">
        {title}
      </Text>
    </MaskedView>
  );
}
