import type { ReactNode } from "react";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Icon, type IconName } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SessionStateIndicator } from "@/features/workspace/components/status-indicators";
import { cn } from "@/lib/utils";

export type TimelineActivityStatus =
  | "completed"
  | "error"
  | "pending"
  | "running";

function ActivityCopy({
  active,
  subtitle,
  title,
}: {
  readonly active: boolean;
  readonly subtitle?: string | undefined;
  readonly title: string;
}) {
  const opacity = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!(active && !reduceMotion)) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.42, {
        duration: 750,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true
    );
    return () => cancelAnimation(opacity);
  }, [active, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      className="min-w-0 flex-1 flex-row items-baseline gap-1.5"
      style={animatedStyle}
    >
      <Text className="shrink-0 text-[13px] font-medium" numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          className="min-w-0 flex-1 text-[12px]"
          numberOfLines={1}
          variant="muted"
        >
          {subtitle}
        </Text>
      ) : null}
    </Animated.View>
  );
}

export function TimelineActivityRow({
  accessibilityLabel,
  expandable = false,
  icon,
  open = false,
  onPress,
  right,
  status,
  subtitle,
  testID,
  title,
}: {
  readonly accessibilityLabel: string;
  readonly expandable?: boolean | undefined;
  readonly icon: IconName;
  readonly open?: boolean | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly right?: ReactNode;
  readonly status: TimelineActivityStatus;
  readonly subtitle?: string | undefined;
  readonly testID: string;
  readonly title: string;
}) {
  const active = status === "pending" || status === "running";
  const canExpand = expandable && !active;
  const content = (
    <>
      <View className="size-5 items-center justify-center">
        {active ? (
          <SessionStateIndicator state="working" />
        ) : (
          <Icon
            className={cn(
              "text-muted-foreground",
              status === "error" && "text-red-500"
            )}
            name={status === "error" ? "circle-alert" : icon}
            size={14}
          />
        )}
      </View>
      <ActivityCopy active={active} subtitle={subtitle} title={title} />
      {right}
      {canExpand ? (
        <Icon
          className="text-muted-foreground/70"
          name={open ? "chevron-down" : "chevron-right"}
          size={12}
        />
      ) : null}
    </>
  );

  if (canExpand && onPress) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        className="active:bg-accent/60 min-h-8 flex-row items-center gap-1.5 rounded-md px-1.5 py-1"
        onPress={onPress}
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      className="min-h-8 flex-row items-center gap-1.5 px-1.5 py-1"
      testID={testID}
    >
      {content}
    </View>
  );
}

export function TimelineChangeStats({
  additions,
  deletions,
}: {
  readonly additions: number;
  readonly deletions: number;
}) {
  if (additions === 0 && deletions === 0) {
    return null;
  }
  return (
    <View className="shrink-0 flex-row items-center gap-1.5">
      <Text className="text-[11px] font-medium text-emerald-600">
        +{additions}
      </Text>
      <Text className="text-[11px] font-medium text-red-500">-{deletions}</Text>
    </View>
  );
}

export function TimelineDetailPanel({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <View className="border-border bg-muted/20 ml-7 overflow-hidden rounded-lg border">
      {children}
    </View>
  );
}
