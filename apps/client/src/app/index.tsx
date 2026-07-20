import { useSettingsValue } from "@/features/settings/settings-context";
import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import {
  defaultVibePadHostConnection,
  type VibePadHostConnection,
} from "@/lib/vibepad-host";
import { VibePadHostProvider } from "@/lib/vibepad-host-context";

export default function WorkspaceScreen() {
  const connections = useSettingsValue((state$) =>
    state$.settings.connections.get()
  );
  const activeHost = connections.hosts.find(
    (host) => host.id === connections.activeHostId
  );
  const connection: VibePadHostConnection = activeHost
    ? { baseUrl: activeHost.url, hostId: activeHost.id }
    : defaultVibePadHostConnection;
  const connectionKey = `${connection.hostId}:${connection.baseUrl}`;

  return (
    <VibePadHostProvider connection={connection} key={connectionKey}>
      <WorkspaceShell />
    </VibePadHostProvider>
  );
}
