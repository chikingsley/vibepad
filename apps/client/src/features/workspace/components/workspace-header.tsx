import type { ServiceSummary } from "@vibepad/protocol/provider";
import type { HostHealthResponse } from "@vibepad/protocol/transport";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { HostConnectionControl } from "@/features/workspace/components/host-connection-control";
import {
  NewSessionControl,
  type NewSessionProject,
} from "@/features/workspace/components/new-session-control";
import {
  type SessionTabItem,
  SessionTabStrip,
} from "@/features/workspace/components/session-tab-strip";
import {
  type SessionSurface,
  SessionWorkbenchControls,
} from "@/features/workspace/components/session-workbench-controls";
import { StatusControl } from "@/features/workspace/components/status-control";
import type { HostConnection } from "@/features/workspace/components/status-indicators";

export function WorkspaceHeader({
  hostConnection,
  hostName,
  hostUrl,
  newSessionDisabled,
  onAddConnection,
  onCloseTab,
  onCreateSession,
  onSelectSurface,
  onSelectTab,
  onToggleSidebar,
  openTabs,
  providerHealthy,
  providers,
  projects,
  selectedProjectId,
  selectedSessionId,
  selectedSurface,
  services,
  servicesLoading,
}: {
  readonly hostConnection: HostConnection;
  readonly hostName: string;
  readonly hostUrl: string;
  readonly newSessionDisabled: boolean;
  readonly onAddConnection: () => void;
  readonly onCloseTab: (sessionId: string) => void;
  readonly onCreateSession: (projectId: string) => Promise<void>;
  readonly onSelectSurface: (surface: SessionSurface) => void;
  readonly onSelectTab: (sessionId: string) => void;
  readonly onToggleSidebar: () => void;
  readonly openTabs: readonly SessionTabItem[];
  readonly providerHealthy: boolean;
  readonly providers: HostHealthResponse["providers"];
  readonly projects: readonly NewSessionProject[];
  readonly selectedProjectId: string | undefined;
  readonly selectedSessionId: string | undefined;
  readonly selectedSurface: SessionSurface;
  readonly services: readonly ServiceSummary[];
  readonly servicesLoading: boolean;
}) {
  return (
    <View className="h-14 flex-row items-center gap-2 border-border border-b bg-background px-2 sm:px-3">
      <Button
        accessibilityLabel="Toggle sidebar"
        onPress={onToggleSidebar}
        size="icon"
        testID="sidebar-toggle"
        variant="ghost"
      >
        <Icon className="text-foreground" name="panel-left" size={18} />
      </Button>
      <NewSessionControl
        disabled={newSessionDisabled}
        onCreate={onCreateSession}
        projects={projects}
        selectedProjectId={selectedProjectId}
      />
      <View className="mx-0.5 h-5 w-px shrink-0 bg-border" />
      <SessionTabStrip
        items={openTabs}
        onClose={onCloseTab}
        onSelect={onSelectTab}
        selectedSessionId={selectedSessionId}
      />
      {selectedSessionId ? (
        <SessionWorkbenchControls
          onSelect={onSelectSurface}
          selected={selectedSurface}
        />
      ) : null}
      <HostConnectionControl
        connection={hostConnection}
        hostName={hostName}
        hostUrl={hostUrl}
        onAddConnection={onAddConnection}
        providers={providers}
      />
      <StatusControl
        healthy={providerHealthy}
        loading={servicesLoading}
        services={services}
      />
    </View>
  );
}
