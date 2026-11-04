import { useColorScheme } from "nativewind";
import { type ReactNode, useCallback } from "react";
import {
  TextInput,
  type TextInputSelectionChangeEvent,
  View,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

const sendTestId = (
  canCancel: boolean,
  sending: boolean,
  canSend: boolean,
  prefix: string
) => {
  if (canCancel) {
    return `${prefix}-cancel`;
  }
  if (sending) {
    return `${prefix}-sending`;
  }
  if (canSend) {
    return `${prefix}-active`;
  }
  return `${prefix}-inactive`;
};

export function SessionComposer({
  attachments,
  canCancel = false,
  canSend,
  className,
  contentOverride,
  errorMessage,
  footerLeading,
  footerTrailing,
  inputTestID = "message-composer",
  onChangeText,
  onCancel,
  onSend,
  onSelectionChange,
  placeholder,
  sendIcon = "arrow-up",
  sendTestID,
  sendTestIDPrefix = "message-send",
  sending,
  status,
  value,
}: {
  readonly attachments?: ReactNode;
  readonly canCancel?: boolean;
  readonly canSend: boolean;
  readonly className?: string;
  readonly contentOverride?: ReactNode;
  readonly errorMessage?: string | undefined;
  readonly footerLeading?: ReactNode;
  readonly footerTrailing?: ReactNode;
  readonly inputTestID?: string;
  readonly onChangeText: (value: string) => void;
  readonly onCancel?: (() => void) | undefined;
  readonly onSend: () => void;
  readonly onSelectionChange?:
    | ((selection: { readonly end: number; readonly start: number }) => void)
    | undefined;
  readonly placeholder: string;
  readonly sendIcon?: "arrow-up" | "check";
  readonly sendTestID?: string;
  readonly sendTestIDPrefix?: string;
  readonly sending: boolean;
  readonly status?: ReactNode;
  readonly value: string;
}) {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const handleSelectionChange = useCallback(
    (event: TextInputSelectionChangeEvent) => {
      onSelectionChange?.(event.nativeEvent.selection);
    },
    [onSelectionChange]
  );

  const actionEnabled = canCancel || canSend;
  let actionBackground = "bg-muted";
  if (canCancel) {
    actionBackground = "bg-foreground active:opacity-80";
  } else if (canSend) {
    actionBackground = "bg-blue-500 active:bg-blue-600";
  }

  return (
    <View
      className={cn(
        "border-border bg-card w-full gap-2 rounded-2xl border p-2 shadow-sm shadow-black/5",
        contentOverride && "rounded-full p-1",
        className
      )}
    >
      {contentOverride ?? (
        <>
          {errorMessage ? (
            <Text className="px-2 pt-1 text-xs text-red-600">
              {errorMessage}
            </Text>
          ) : null}
          {attachments}
          <TextInput
            accessibilityLabel={placeholder}
            className="text-foreground max-h-36 min-h-14 px-2 py-2 text-[15px] outline-none"
            multiline
            onChangeText={onChangeText}
            onSelectionChange={handleSelectionChange}
            placeholder={placeholder}
            placeholderTextColor={theme.mutedForeground}
            style={{ color: theme.foreground }}
            testID={inputTestID}
            value={value}
          />
          <View className="flex-row items-center gap-2">
            {footerLeading}
            <View className="ml-auto flex-row items-center gap-1">
              {footerTrailing}
              <Button
                accessibilityLabel={canCancel ? "Stop" : "Send"}
                className={cn("rounded-full", actionBackground)}
                disabled={!actionEnabled}
                onPress={canCancel ? onCancel : onSend}
                size="icon"
                testID={
                  sendTestID ??
                  sendTestId(canCancel, sending, canSend, sendTestIDPrefix)
                }
              >
                <Icon
                  className={
                    actionEnabled ? "text-background" : "text-muted-foreground"
                  }
                  name={canCancel ? "square" : sendIcon}
                  size={16}
                />
              </Button>
            </View>
          </View>
          {status}
        </>
      )}
    </View>
  );
}
