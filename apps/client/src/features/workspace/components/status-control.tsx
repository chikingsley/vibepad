import {
  Content as TabsContent,
  List as TabsList,
  Root as TabsRoot,
  Trigger as TabsTrigger,
  useRootContext,
} from "@rn-primitives/tabs";
import type { ServiceState, ServiceSummary } from "@vibepad/protocol/provider";
import { useColorScheme } from "nativewind";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Text } from "@/components/ui/text";
import type { HostConnection } from "@/features/workspace/components/status-indicators";
import { cn } from "@/lib/utils";

type StatusTab = "lsp" | "mcp" | "plugins";

const statusTabs = [
  { label: "MCP", value: "mcp" },
  { label: "LSP", value: "lsp" },
  { label: "Plugins", value: "plugins" },
] as const satisfies readonly { label: string; value: StatusTab }[];

const categoryForTab = (tab: StatusTab) => (tab === "plugins" ? "plugin" : tab);

const servicesForTab = (services: readonly ServiceSummary[], tab: StatusTab) =>
  services.filter((service) => service.category === categoryForTab(tab));

function OpenCodeStatusGlyph({ active }: { readonly active: boolean }) {
  const { colorScheme } = useColorScheme();
  const color = colorScheme === "dark" ? "#f3efe7" : "#25272b";

  return (
    <Icon
      accessibilityElementsHidden
      color={active ? [`${color}1a`, color] : color}
      importantForAccessibility="no-hide-descendants"
      name={active ? "opencode-status-active" : "opencode-status"}
      size={20}
    />
  );
}

function StatusTabTrigger({
  count,
  label,
  value,
}: {
  readonly count: number;
  readonly label: string;
  readonly value: StatusTab;
}) {
  const root = useRootContext();
  const selected = root.value === value;

  return (
    <TabsTrigger
      className="relative h-11 items-center justify-center px-0"
      testID={`system-status-tab-${value}`}
      value={value}
    >
      <Text
        className={cn(
          "text-xs",
          selected ? "font-medium text-foreground" : "text-muted-foreground"
        )}
      >
        {count > 0 ? `${count} ` : ""}
        {label}
      </Text>
      {selected ? (
        <View className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
      ) : null}
    </TabsTrigger>
  );
}

function toneClass(state: ServiceState) {
  if (state === "error") {
    return "bg-red-500";
  }
  if (state === "attention") {
    return "bg-amber-400";
  }
  if (state === "disabled") {
    return "bg-muted-foreground";
  }
  return "bg-emerald-500";
}

const stateLabel: Record<ServiceState, string> = {
  attention: "Needs attention",
  disabled: "Disabled",
  error: "Error",
  ready: "Ready",
};

function ServiceList({
  emptyMessage,
  items,
  loading,
}: {
  readonly emptyMessage: string;
  readonly items: readonly ServiceSummary[];
  readonly loading: boolean;
}) {
  const statusMessage = loading ? "Loading status…" : emptyMessage;

  return (
    <View className="m-2 min-h-24 rounded-lg bg-muted/55 p-3">
      {items.length === 0 ? (
        <View className="min-h-16 items-center justify-center px-3">
          <Text className="text-xs" variant="muted">
            {statusMessage}
          </Text>
        </View>
      ) : null}
      {items.map((item) => (
        <View
          className="min-h-9 flex-row items-center gap-2 rounded-md px-2 py-1.5"
          key={item.id}
        >
          <View
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              toneClass(item.state)
            )}
          />
          <View className="min-w-0 flex-1">
            <Text className="text-sm" numberOfLines={1}>
              {item.label}
            </Text>
            {item.detail ? (
              <Text className="text-[10px]" numberOfLines={1} variant="muted">
                {item.detail}
              </Text>
            ) : null}
          </View>
          <Text className="text-[11px]" variant="muted">
            {stateLabel[item.state]}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ConnectionOverviewRow({
  detail,
  label,
  ready,
  testID,
}: {
  readonly detail: string;
  readonly label: string;
  readonly ready: boolean;
  readonly testID: string;
}) {
  return (
    <View
      className="min-h-9 flex-row items-center gap-2 rounded-md px-2 py-1.5"
      testID={testID}
    >
      <View
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          ready ? "bg-emerald-500" : "bg-red-500"
        )}
      />
      <Text className="min-w-0 flex-1 text-sm" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-[11px]" variant="muted">
        {detail}
      </Text>
    </View>
  );
}

const emptyMessageForTab = (tab: StatusTab) =>
  tab === "plugins"
    ? "No plugins configured"
    : `No ${tab.toUpperCase()} services active`;

const aggregateToneClass = ({
  degraded,
  failed,
  healthy,
}: {
  readonly degraded: boolean;
  readonly failed: boolean;
  readonly healthy: boolean;
}) => {
  if (!healthy || failed) {
    return "bg-red-500";
  }
  if (degraded) {
    return "bg-amber-400";
  }
  return "bg-emerald-500";
};

export function StatusControl({
  hostConnection,
  loading,
  providerHealthy,
  services,
}: {
  readonly hostConnection: HostConnection;
  readonly loading: boolean;
  readonly providerHealthy: boolean;
  readonly services: readonly ServiceSummary[];
}) {
  const visibleTabs = statusTabs.filter(
    (tab) => servicesForTab(services, tab.value).length > 0
  );
  const [open, setOpen] = useState(false);
  const [requestedTab, setRequestedTab] = useState<StatusTab>("mcp");
  const activeTab = visibleTabs.some((tab) => tab.value === requestedTab)
    ? requestedTab
    : visibleTabs[0]?.value;
  const changeTab = useCallback((value: string) => {
    setRequestedTab(value as StatusTab);
  }, []);
  const hostOnline = hostConnection === "online";
  const degraded = services.some(
    (service) => service.state === "attention" || service.state === "disabled"
  );
  const failed = services.some((service) => service.state === "error");
  const aggregateTone = aggregateToneClass({
    degraded,
    failed,
    healthy: hostOnline && providerHealthy,
  });

  const statusLabel =
    visibleTabs.length > 0
      ? `host, provider, and ${visibleTabs.map((tab) => tab.label).join(", ")}`
      : "host and provider";

  return (
    <Popover onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          accessibilityLabel={`Open ${statusLabel} status`}
          className="relative size-11 sm:size-11"
          size="icon"
          testID="system-status-trigger"
          variant="ghost"
        >
          <OpenCodeStatusGlyph active={open} />
          <View
            className={cn(
              "absolute top-1.5 right-1.5 size-2 rounded-full border border-background",
              aggregateTone
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[360px] overflow-hidden rounded-xl p-0"
        side="bottom"
        sideOffset={6}
      >
        <View
          className={cn(
            "m-2 rounded-lg bg-muted/55 p-1.5",
            visibleTabs.length > 0 && "mb-0"
          )}
          testID="system-status-overview"
        >
          <ConnectionOverviewRow
            detail={hostOnline ? "Reachable" : "Offline"}
            label="Host"
            ready={hostOnline}
            testID="system-status-host"
          />
          <ConnectionOverviewRow
            detail={providerHealthy ? "Healthy" : "Unavailable"}
            label="Provider"
            ready={providerHealthy}
            testID="system-status-provider"
          />
        </View>
        {visibleTabs.length > 0 ? (
          <TabsRoot
            className="w-full"
            onValueChange={changeTab}
            value={activeTab ?? "mcp"}
          >
            <TabsList className="h-11 flex-row gap-4 px-4 pt-1">
              {visibleTabs.map((tab) => (
                <StatusTabTrigger
                  count={servicesForTab(services, tab.value).length}
                  key={tab.value}
                  label={tab.label}
                  value={tab.value}
                />
              ))}
            </TabsList>
            {visibleTabs.map((tab) => (
              <TabsContent
                key={tab.value}
                testID={`system-status-panel-${tab.value}`}
                value={tab.value}
              >
                <ServiceList
                  emptyMessage={emptyMessageForTab(tab.value)}
                  items={servicesForTab(services, tab.value)}
                  loading={loading}
                />
              </TabsContent>
            ))}
          </TabsRoot>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
