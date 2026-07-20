import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
} from "react";
import {
  createProjectResourcesStore,
  type ProjectResourcesStore,
} from "@/features/workspace/state/project-resources-store";
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
  readonly projectResources: ProjectResourcesStore;
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
      projectResources: createProjectResourcesStore(client),
      workspace: createWorkspaceStore(client),
      workspaceUi: createWorkspaceUiStore(),
    };
  }, [baseUrl, hostId]);
  useEffect(
    () => () => {
      runtime.projectResources.cancelPending();
    },
    [runtime]
  );
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

export const useVibePadProjectResourcesStore = () =>
  useVibePadHostRuntime().projectResources;

export const useVibePadWorkspaceStore = () => useVibePadHostRuntime().workspace;

export const useVibePadWorkspaceUiStore = () =>
  useVibePadHostRuntime().workspaceUi;
