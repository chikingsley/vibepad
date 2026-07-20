import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
} from "react";

import {
  createWorkspaceStore,
  type WorkspaceStore,
} from "@/features/workspace/state/workspace-store";
import {
  createWorkspaceUiStore,
  type WorkspaceUiStore,
} from "@/features/workspace/state/workspace-ui-store";
import {
  VibePadHostClient,
  type VibePadHostConnection,
} from "@/lib/vibepad-host";

interface VibePadHostRuntime {
  readonly client: VibePadHostClient;
  readonly workspace: WorkspaceStore;
  readonly workspaceUi: WorkspaceUiStore;
}

const VibePadHostContext = createContext<VibePadHostRuntime | undefined>(
  undefined
);

export function VibePadHostProvider({
  children,
  connection,
}: PropsWithChildren<{
  readonly connection: VibePadHostConnection;
}>) {
  const { baseUrl, hostId } = connection;
  const runtime = useMemo(() => {
    const client = new VibePadHostClient({ baseUrl, hostId });
    return {
      client,
      workspace: createWorkspaceStore(client),
      workspaceUi: createWorkspaceUiStore(),
    };
  }, [baseUrl, hostId]);
  return (
    <VibePadHostContext.Provider value={runtime}>
      {children}
    </VibePadHostContext.Provider>
  );
}

const useVibePadHostRuntime = () => {
  const runtime = useContext(VibePadHostContext);
  if (!runtime) {
    throw new Error("useVibePadHost must be used inside VibePadHostProvider");
  }
  return runtime;
};

export const useVibePadHost = () => useVibePadHostRuntime().client;

export const useVibePadWorkspaceStore = () => useVibePadHostRuntime().workspace;

export const useVibePadWorkspaceUiStore = () =>
  useVibePadHostRuntime().workspaceUi;
