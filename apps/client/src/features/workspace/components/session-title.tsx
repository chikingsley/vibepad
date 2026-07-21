import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

import { Text } from "@/components/ui/text";

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
