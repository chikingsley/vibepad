import { useCallback } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { PreviewBrowserTab } from "@/features/preview/preview-browser-tab";
import { cn } from "@/lib/utils";

function BrowserTab({
  active,
  onClose,
  onSelect,
  tab,
}: {
  readonly active: boolean;
  readonly onClose: (tabId: string) => void;
  readonly onSelect: (tabId: string) => void;
  readonly tab: PreviewBrowserTab;
}) {
  const select = useCallback(() => {
    onSelect(tab.id);
  }, [onSelect, tab.id]);
  const close = useCallback(() => {
    onClose(tab.id);
  }, [onClose, tab.id]);

  return (
    <View
      className={cn(
        "h-8 min-w-32 max-w-48 flex-row items-center rounded-t-md border px-1",
        active
          ? "border-border border-b-background bg-background"
          : "border-transparent bg-transparent"
      )}
      testID={`browser-tab-${tab.id}`}
    >
      <Pressable
        accessibilityLabel={`Open browser tab ${tab.title}`}
        className="min-w-0 flex-1 flex-row items-center gap-1.5 px-1.5"
        onPress={select}
      >
        {tab.loading ? (
          <ActivityIndicator color="#737373" size={10} />
        ) : (
          <Icon
            className="text-muted-foreground"
            name={tab.owner === "agent" ? "sparkles" : "browser"}
            size={11}
          />
        )}
        <Text className="min-w-0 flex-1 text-[11px]" numberOfLines={1}>
          {tab.title}
        </Text>
      </Pressable>
      <Button
        accessibilityLabel={`Close browser tab ${tab.title}`}
        className="size-6 rounded-sm"
        onPress={close}
        size="icon"
        testID={`browser-tab-close-${tab.id}`}
        variant="ghost"
      >
        <Icon className="text-muted-foreground" name="x" size={11} />
      </Button>
    </View>
  );
}

export function BrowserTabStrip({
  activeTabId,
  onClose,
  onNewTab,
  onSelect,
  tabs,
}: {
  readonly activeTabId: string | undefined;
  readonly onClose: (tabId: string) => void;
  readonly onNewTab: () => void;
  readonly onSelect: (tabId: string) => void;
  readonly tabs: readonly PreviewBrowserTab[];
}) {
  return (
    <View
      className="h-9 flex-row items-end border-border border-b bg-muted/45 pl-2"
      testID="browser-tab-strip"
    >
      <ScrollView
        className="min-w-0 flex-1"
        contentContainerClassName="flex-row items-end gap-0.5"
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
      >
        {tabs.map((tab) => (
          <BrowserTab
            active={tab.id === activeTabId}
            key={tab.id}
            onClose={onClose}
            onSelect={onSelect}
            tab={tab}
          />
        ))}
      </ScrollView>
      <Button
        accessibilityLabel="Open browser tab"
        className="mb-0.5 size-7 rounded-md"
        onPress={onNewTab}
        size="icon"
        testID="browser-new-tab"
        variant="ghost"
      >
        <Icon className="text-muted-foreground" name="plus" size={13} />
      </Button>
      <View
        accessibilityLabel="Persistent on-device WebView data"
        className="mx-1.5 mb-1 hidden h-6 flex-row items-center gap-1.5 rounded-md bg-background/80 px-2 sm:flex"
        testID="browser-profile-status"
      >
        <Icon className="text-muted-foreground" name="browser" size={10} />
        <Text className="text-[9px]" variant="muted">
          On-device
        </Text>
      </View>
    </View>
  );
}
