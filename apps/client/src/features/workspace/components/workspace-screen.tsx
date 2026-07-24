import {
  HostActivationScreen,
  SettingsLoadingScreen,
} from "@/features/connections/components/host-activation-screen";
import { resolveConnectionEntryState } from "@/features/connections/connection-entry-state";
import {
  useAppSettingsStore,
  useSettingsValue,
} from "@/features/settings/settings-context";
import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import {
  defaultVibePadHostConnection,
  type VibePadHostConnection,
} from "@/lib/vibepad-host";
import { VibePadHostProvider } from "@/lib/vibepad-host-context";

export function WorkspaceScreen() {
  const settings = useAppSettingsStore();
  const { connections, errorMessage, persistenceState } = useSettingsValue(
    (state$) => ({
      connections: state$.settings.connections.get(),
      errorMessage: state$.errorMessage.get(),
      persistenceState: state$.persistenceState.get(),
    })
  );
  const entry = resolveConnectionEntryState(
    connections,
    persistenceState,
    errorMessage
  );
  if (entry.status === "loading") {
    return <SettingsLoadingScreen />;
  }
  if (entry.status === "activation") {
    return (
      <VibePadHostProvider connection={defaultVibePadHostConnection}>
        <HostActivationScreen
          {...(entry.errorMessage
            ? {
                errorMessage: entry.errorMessage,
                onRetrySettings: settings.load,
              }
            : {})}
        />
      </VibePadHostProvider>
    );
  }
  const connection: VibePadHostConnection = {
    baseUrl: entry.host.url,
    hostId: entry.host.id,
  };
  const connectionKey = `${connection.hostId}:${connection.baseUrl}`;

  return (
    <VibePadHostProvider connection={connection} key={connectionKey}>
      <WorkspaceShell />
    </VibePadHostProvider>
  );
}
