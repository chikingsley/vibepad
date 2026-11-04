import type { TextInputSubmitEditingEvent } from "react-native";
import { TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

function PreviewToolButton({
  accessibilityLabel,
  disabled = false,
  icon,
  onPress,
  testID,
}: {
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly icon: IconName;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      className="size-11 rounded-md sm:size-11"
      disabled={disabled}
      onPress={onPress}
      size="icon"
      testID={testID}
      variant="ghost"
    >
      <Icon className="text-muted-foreground" name={icon} size={14} />
    </Button>
  );
}

export function PreviewNavigationBar({
  canGoBack,
  canGoForward,
  draftUrl,
  expanded,
  hasActiveTab,
  loading,
  onBack,
  onClose,
  onDraftUrlChange,
  onForward,
  onOpenExternal,
  onReload,
  onSubmitDraftUrl,
  onToggleExpanded,
}: {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly draftUrl: string;
  readonly expanded: boolean;
  readonly hasActiveTab: boolean;
  readonly loading: boolean;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly onDraftUrlChange: (value: string) => void;
  readonly onForward: () => void;
  readonly onOpenExternal: () => void;
  readonly onReload: () => void;
  readonly onSubmitDraftUrl: (event: TextInputSubmitEditingEvent) => void;
  readonly onToggleExpanded: () => void;
}) {
  return (
    <View className="border-border h-12 flex-row items-center gap-1 border-b px-2">
      <PreviewToolButton
        accessibilityLabel="Preview back"
        disabled={!canGoBack}
        icon="chevron-left"
        onPress={onBack}
        testID="preview-back"
      />
      <PreviewToolButton
        accessibilityLabel="Preview forward"
        disabled={!canGoForward}
        icon="chevron-right"
        onPress={onForward}
        testID="preview-forward"
      />
      <PreviewToolButton
        accessibilityLabel="Reload preview"
        disabled={!hasActiveTab}
        icon="rotate-ccw"
        onPress={onReload}
        testID="preview-reload"
      />
      <View className="border-border bg-card mx-1 h-10 min-w-40 flex-1 flex-row items-center rounded-md border px-3">
        <TextInput
          accessibilityLabel="Preview URL"
          autoCapitalize="none"
          autoCorrect={false}
          className="text-foreground min-w-0 flex-1 text-xs leading-4 outline-none"
          editable={hasActiveTab}
          onChangeText={onDraftUrlChange}
          onSubmitEditing={onSubmitDraftUrl}
          returnKeyType="go"
          testID="preview-url"
          value={draftUrl}
        />
        {loading ? (
          <Text className="text-muted-foreground" variant="metadata">
            Loading…
          </Text>
        ) : null}
      </View>
      <PreviewToolButton
        accessibilityLabel="Open preview externally"
        disabled={!hasActiveTab}
        icon="external-link"
        onPress={onOpenExternal}
        testID="preview-open-external"
      />
      <PreviewToolButton
        accessibilityLabel={expanded ? "Restore split view" : "Expand preview"}
        icon={expanded ? "minimize-2" : "maximize-2"}
        onPress={onToggleExpanded}
        testID="session-workbench-expand"
      />
      <PreviewToolButton
        accessibilityLabel="Close preview"
        icon="x"
        onPress={onClose}
        testID="session-workbench-close"
      />
    </View>
  );
}
