import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

import { Text } from "@/components/ui/text";

export function SessionTitle({ title }: { readonly title: string }) {
  return (
    <MaskedView
      maskElement={
        <LinearGradient
          colors={["#000000", "#000000", "transparent"]}
          locations={[0, 0.82, 1]}
          style={{ flex: 1 }}
        />
      }
      style={{ flex: 1, minWidth: 0 }}
    >
      <Text className="text-[13px]" ellipsizeMode="clip" numberOfLines={1}>
        {title}
      </Text>
    </MaskedView>
  );
}
