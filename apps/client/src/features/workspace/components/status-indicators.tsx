import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { Icon } from "@/components/ui/icon";

export type HostConnection = "offline" | "online";
export type SessionIndicatorState =
  | "idle"
  | "permission"
  | "question"
  | "retrying"
  | "working";

function WorkingSpinner({ retrying }: { readonly retrying: boolean }) {
  const rotation = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      rotation.value = 0;
      return;
    }

    rotation.value = withRepeat(
      withTiming(360, {
        duration: 900,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    return () => {
      cancelAnimation(rotation);
    };
  }, [reduceMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      className="size-4 items-center justify-center"
      importantForAccessibility="no-hide-descendants"
      style={animatedStyle}
    >
      <Svg height={14} viewBox="0 0 14 14" width={14}>
        <Circle
          cx={7}
          cy={7}
          fill="none"
          r={5.25}
          stroke="#d7dbe2"
          strokeWidth={1.6}
        />
        <Circle
          cx={7}
          cy={7}
          fill="none"
          r={5.25}
          stroke={retrying ? "#d97706" : "#3182f6"}
          strokeDasharray="9 24"
          strokeLinecap="round"
          strokeWidth={1.8}
          transform="rotate(-90 7 7)"
        />
      </Svg>
    </Animated.View>
  );
}

export function ConnectionIndicator({
  connection,
}: {
  readonly connection: HostConnection;
}) {
  if (connection === "offline") {
    return (
      <Icon
        accessibilityElementsHidden
        className="text-red-500"
        importantForAccessibility="no-hide-descendants"
        name="circle-alert"
        size={13}
      />
    );
  }

  return (
    <View
      accessibilityElementsHidden
      className="size-2 rounded-full bg-emerald-500"
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function SessionStateIndicator({
  state,
}: {
  readonly state: SessionIndicatorState;
}) {
  if (state === "working" || state === "retrying") {
    return <WorkingSpinner retrying={state === "retrying"} />;
  }

  if (state === "permission" || state === "question") {
    return (
      <View
        accessibilityElementsHidden
        className="bg-background size-2.5 rounded-full border-2 border-blue-500"
        importantForAccessibility="no-hide-descendants"
      />
    );
  }

  return null;
}
