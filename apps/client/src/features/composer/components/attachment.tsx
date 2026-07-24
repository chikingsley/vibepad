import { createContext, type ReactNode, useContext } from "react";
import {
  Pressable,
  type PressableProps,
  ScrollView,
  View,
  type ViewProps,
} from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type AttachmentOrientation = "horizontal" | "vertical";
export type AttachmentSize = "default" | "sm" | "xs";
export type AttachmentState =
  | "done"
  | "error"
  | "idle"
  | "processing"
  | "uploading";

interface AttachmentContextValue {
  readonly orientation: AttachmentOrientation;
  readonly size: AttachmentSize;
  readonly state: AttachmentState;
}

const AttachmentContext = createContext<AttachmentContextValue | undefined>(
  undefined
);

const useAttachment = () => {
  const value = useContext(AttachmentContext);
  if (!value) {
    throw new Error("Attachment parts must be rendered inside Attachment");
  }
  return value;
};

export function Attachment({
  children,
  className,
  orientation = "horizontal",
  size = "default",
  state = "idle",
  ...props
}: ViewProps & {
  readonly children: ReactNode;
  readonly orientation?: AttachmentOrientation;
  readonly size?: AttachmentSize;
  readonly state?: AttachmentState;
}) {
  return (
    <AttachmentContext.Provider value={{ orientation, size, state }}>
      <View
        accessibilityState={{
          busy: state === "processing" || state === "uploading",
          disabled: state === "error",
        }}
        className={cn(
          "relative overflow-hidden rounded-xl border border-border bg-card",
          orientation === "horizontal"
            ? "min-h-14 flex-row items-center"
            : "w-32 flex-col",
          state === "error" && "border-red-500/50 bg-red-500/5",
          className
        )}
        {...props}
      >
        {children}
      </View>
    </AttachmentContext.Provider>
  );
}

export function AttachmentTrigger({
  children,
  className,
  ...props
}: PressableProps & { readonly children: ReactNode }) {
  const { orientation } = useAttachment();
  return (
    <Pressable
      className={cn(
        "min-w-0 flex-1 active:bg-accent/60",
        orientation === "horizontal"
          ? "flex-row items-center gap-2.5 p-2"
          : "flex-col",
        className
      )}
      {...props}
    >
      {children}
    </Pressable>
  );
}

export function AttachmentMedia({ className, ...props }: ViewProps) {
  const { orientation, size } = useAttachment();
  return (
    <View
      className={cn(
        "shrink-0 overflow-hidden bg-muted",
        orientation === "horizontal" &&
          size === "default" &&
          "size-11 rounded-lg",
        orientation === "horizontal" && size === "sm" && "size-9 rounded-md",
        orientation === "horizontal" && size === "xs" && "size-7 rounded-md",
        orientation === "vertical" && "aspect-[4/3] w-full",
        className
      )}
      {...props}
    />
  );
}

export function AttachmentContent({ className, ...props }: ViewProps) {
  const { orientation } = useAttachment();
  return (
    <View
      className={cn(
        "min-w-0 flex-1",
        orientation === "vertical" && "w-full gap-0.5 p-2.5",
        className
      )}
      {...props}
    />
  );
}

export function AttachmentTitle({
  className,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={cn("font-medium text-xs", className)}
      numberOfLines={1}
      {...props}
    />
  );
}

export function AttachmentDescription({
  className,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={cn("text-[10px]", className)}
      numberOfLines={1}
      variant="muted"
      {...props}
    />
  );
}

export function AttachmentActions({ className, ...props }: ViewProps) {
  const { orientation } = useAttachment();
  return (
    <View
      className={cn(
        orientation === "horizontal"
          ? "mr-1 flex-row items-center"
          : "absolute top-1 right-1 flex-row items-center",
        className
      )}
      {...props}
    />
  );
}

export function AttachmentAction({ className, ...props }: PressableProps) {
  return (
    <Pressable
      className={cn(
        "size-8 items-center justify-center rounded-full active:bg-accent",
        className
      )}
      hitSlop={6}
      {...props}
    />
  );
}

export function AttachmentGroup({
  children,
  className,
  orientation = "horizontal",
  ...props
}: Omit<React.ComponentProps<typeof ScrollView>, "horizontal"> & {
  readonly children: ReactNode;
  readonly orientation?: AttachmentOrientation;
}) {
  if (orientation === "vertical") {
    return <View className={cn("gap-2", className)}>{children}</View>;
  }

  return (
    <ScrollView
      className={cn("max-w-full", className)}
      contentContainerClassName="gap-2"
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      {...props}
    >
      {children}
    </ScrollView>
  );
}
