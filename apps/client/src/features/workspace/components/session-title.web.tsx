import type { ViewStyle } from "react-native";
import { View } from "react-native";

import { Text } from "@/components/ui/text";

const fadeMask = {
  maskImage:
    "linear-gradient(to right, #000 0%, #000 calc(100% - 24px), transparent 100%)",
  WebkitMaskImage:
    "linear-gradient(to right, #000 0%, #000 calc(100% - 24px), transparent 100%)",
} as ViewStyle;

export function SessionTitle({ title }: { readonly title: string }) {
  return (
    <View className="min-w-0 flex-1 overflow-hidden" style={fadeMask}>
      <Text className="whitespace-nowrap text-[13px]">{title}</Text>
    </View>
  );
}
