import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useCallback } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

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
        "h-11 min-w-36 max-w-56 flex-row items-center rounded-md border px-1",
        active
          ? "border-border bg-background shadow-black/5 shadow-sm"
          : "border-border/55 bg-background/35"
      )}
      testID={`browser-tab-${tab.id}`}
    >
      <Pressable
        accessibilityLabel={`Open browser tab ${tab.title}`}
        className="h-full min-w-0 flex-1 flex-row items-center gap-2 px-2"
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
        <Text className="min-w-0 flex-1" numberOfLines={1} variant="control">
          {tab.title}
        </Text>
      </Pressable>
      <Button
        accessibilityLabel={`Close browser tab ${tab.title}`}
        className="size-11 rounded-md sm:size-11"
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

const browserTabKey = (tab: PreviewBrowserTab) => tab.id;

export function BrowserTabStrip({
  activeTabId,
  onClose,
  onNewTab,
  onSelect,
  sessionId,
  tabs,
}: {
  readonly activeTabId: string | undefined;
  readonly onClose: (tabId: string) => void;
  readonly onNewTab: () => void;
  readonly onSelect: (tabId: string) => void;
  readonly sessionId: string;
  readonly tabs: readonly PreviewBrowserTab[];
}) {
  const renderTab = useCallback(
    ({ item: tab }: LegendListRenderItemProps<PreviewBrowserTab>) => (
      <BrowserTab
        active={tab.id === activeTabId}
        onClose={onClose}
        onSelect={onSelect}
        tab={tab}
      />
    ),
    [activeTabId, onClose, onSelect]
  );

  return (
    <View
      className="h-12 flex-row items-center border-border border-b bg-muted/45 pl-2"
      testID="browser-tab-strip"
    >
      {tabs.length === 0 ? (
        <View className="min-w-0 flex-1" />
      ) : (
        <LegendList
          contentContainerStyle={{ alignItems: "center", gap: 4 }}
          data={tabs}
          dataKey={`browser-tabs:${sessionId}`}
          estimatedItemSize={176}
          horizontal
          keyExtractor={browserTabKey}
          recycleItems
          renderItem={renderTab}
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1, minWidth: 0 }}
        />
      )}
      <Button
        accessibilityLabel="Open browser tab"
        className="size-11 rounded-md sm:size-11"
        onPress={onNewTab}
        size="icon"
        testID="browser-new-tab"
        variant="ghost"
      >
        <Icon className="text-muted-foreground" name="plus" size={13} />
      </Button>
      <View className="w-1" />
    </View>
  );
}
