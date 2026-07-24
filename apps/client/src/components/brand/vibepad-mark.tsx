import { Image, View } from "react-native";

import { cn } from "@/lib/utils";

const vibepadIcon = require("../../../assets/images/icon.png");

export function VibePadMark({ className }: { readonly className?: string }) {
  return (
    <View className={cn("overflow-hidden rounded-lg", className)}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={vibepadIcon}
        style={{ height: "100%", width: "100%" }}
      />
    </View>
  );
}
