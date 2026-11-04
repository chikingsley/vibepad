import type { ServiceSummary } from "@vibepad/protocol/provider";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SessionTitle } from "@/features/workspace/components/session-title";
import {
  type SessionSurface,
  SessionWorkbenchControls,
} from "@/features/workspace/components/session-workbench-controls";
import { StatusControl } from "@/features/workspace/components/status-control";
import type { HostConnection } from "@/features/workspace/components/status-indicators";

export function WorkspaceHeader({
  hostConnection,
  onSelectSurface,
  onToggleSidebar,
  projectName,
  providerHealthy,
  selectedSessionId,
  selectedSurface,
  services,
  servicesLoading,
  sessionTitle,
}: {
  readonly hostConnection: HostConnection;
  readonly onSelectSurface: (surface: SessionSurface) => void;
  readonly onToggleSidebar: () => void;
  readonly projectName: string | undefined;
  readonly providerHealthy: boolean;
  readonly selectedSessionId: string | undefined;
  readonly selectedSurface: SessionSurface;
  readonly services: readonly ServiceSummary[];
  readonly servicesLoading: boolean;
  readonly sessionTitle: string | undefined;
}) {
  return (
    <View className="border-border bg-background h-12 flex-row items-center border-b px-1">
      <Button
        accessibilityLabel="Toggle sidebar"
        className="size-11 sm:size-11"
        onPress={onToggleSidebar}
        size="icon"
        testID="sidebar-toggle"
        variant="ghost"
      >
        <Icon className="text-foreground" name="panel-left" size={18} />
      </Button>
      <View className="bg-border mx-1 h-5 w-px shrink-0" />
      <View
        className="min-w-0 flex-1 flex-row items-center gap-2 px-2"
        testID="header-session-context"
      >
        {sessionTitle ? (
          <SessionTitle fill={false} title={sessionTitle} />
        ) : null}
        {projectName ? (
          <>
            <Text className="text-muted-foreground" variant="metadata">
              ·
            </Text>
            <Text
              className="text-muted-foreground max-w-40"
              numberOfLines={1}
              variant="metadata"
            >
              {projectName}
            </Text>
          </>
        ) : null}
      </View>
      {selectedSessionId ? (
        <SessionWorkbenchControls
          onSelect={onSelectSurface}
          selected={selectedSurface}
        />
      ) : null}
      <View className="bg-border mx-1 h-5 w-px shrink-0" />
      <StatusControl
        hostConnection={hostConnection}
        loading={servicesLoading}
        providerHealthy={providerHealthy}
        services={services}
      />
    </View>
  );
}
