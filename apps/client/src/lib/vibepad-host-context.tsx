import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
} from "react";
import {
  createSessionRuntimeStore,
  type SessionRuntimeStore,
} from "@/features/timeline/state/session-runtime-store";
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
  readonly sessionRuntime: SessionRuntimeStore;
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
    const workspace = createWorkspaceStore(client);
    return {
      client,
      projectResources: createProjectResourcesStore(client),
      sessionRuntime: createSessionRuntimeStore(
        client,
        workspace.upsertSession
      ),
      workspace,
      workspaceUi: createWorkspaceUiStore(),
    };
  }, [baseUrl, hostId]);
  useEffect(
    () => () => {
      runtime.projectResources.cancelPending();
      runtime.sessionRuntime.cancelPending();
      runtime.workspace.cancelPending();
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

export const useVibePadSessionRuntimeStore = () =>
  useVibePadHostRuntime().sessionRuntime;

export const useVibePadWorkspaceStore = () => useVibePadHostRuntime().workspace;

export const useVibePadWorkspaceUiStore = () =>
  useVibePadHostRuntime().workspaceUi;
