import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  FadeInDown,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";

import { motion } from "./motion";

interface MotionSurfaceProps extends PropsWithChildren {
  readonly delay?: number;
  readonly style?: StyleProp<ViewStyle>;
}

export function MotionSurface({
  children,
  delay = 0,
  style,
}: MotionSurfaceProps) {
  const entering = FadeInDown.delay(delay)
    .springify()
    .damping(motion.spring.damping)
    .mass(motion.spring.mass)
    .stiffness(motion.spring.stiffness)
    .reduceMotion(ReduceMotion.System);

  const layout = LinearTransition.duration(
    motion.duration.standard
  ).reduceMotion(ReduceMotion.System);

  return (
    <Animated.View entering={entering} layout={layout} style={style}>
      {children}
    </Animated.View>
  );
}
