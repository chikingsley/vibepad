import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
} from "react";
import {
  createSessionComposerStore,
  type SessionComposerStore,
} from "@/features/composer/state/session-composer-store";
import {
  createFileNavigationStore,
  type FileNavigationStore,
} from "@/features/files/state/file-navigation-store";
import {
  createProjectFilesStore,
  type ProjectFilesStore,
} from "@/features/files/state/project-files-store";
import {
  createPreviewStore,
  type PreviewStore,
} from "@/features/preview/state/preview-store";
import {
  createSessionRuntimeStore,
  type SessionRuntimeStore,
} from "@/features/timeline/state/session-runtime-store";
import {
  createTimelineDisclosureStore,
  type TimelineDisclosureStore,
} from "@/features/timeline/state/timeline-disclosure-store";
import {
  createVoiceCatalogStore,
  type VoiceCatalogStore,
} from "@/features/voice/state/voice-catalog-store";
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
  readonly fileNavigation: FileNavigationStore;
  readonly preview: PreviewStore;
  readonly projectFiles: ProjectFilesStore;
  readonly projectResources: ProjectResourcesStore;
  readonly sessionComposer: SessionComposerStore;
  readonly sessionRuntime: SessionRuntimeStore;
  readonly timelineDisclosure: TimelineDisclosureStore;
  readonly voiceCatalog: VoiceCatalogStore;
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
      fileNavigation: createFileNavigationStore(),
      preview: createPreviewStore(),
      projectFiles: createProjectFilesStore(client),
      projectResources: createProjectResourcesStore(client),
      sessionComposer: createSessionComposerStore(),
      sessionRuntime: createSessionRuntimeStore(
        client,
        workspace.upsertSession
      ),
      timelineDisclosure: createTimelineDisclosureStore(),
      voiceCatalog: createVoiceCatalogStore(client),
      workspace,
      workspaceUi: createWorkspaceUiStore(),
    };
  }, [baseUrl, hostId]);
  useEffect(
    () => () => {
      runtime.projectFiles.cancelPending();
      runtime.projectResources.cancelPending();
      runtime.sessionRuntime.cancelPending();
      runtime.voiceCatalog.cancelPending();
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

export const useVibePadFileNavigationStore = () =>
  useVibePadHostRuntime().fileNavigation;

export const useVibePadProjectFilesStore = () =>
  useVibePadHostRuntime().projectFiles;

export const useVibePadProjectResourcesStore = () =>
  useVibePadHostRuntime().projectResources;

export const useVibePadPreviewStore = () => useVibePadHostRuntime().preview;

export const useVibePadSessionRuntimeStore = () =>
  useVibePadHostRuntime().sessionRuntime;

export const useVibePadSessionComposerStore = () =>
  useVibePadHostRuntime().sessionComposer;

export const useVibePadTimelineDisclosureStore = () =>
  useVibePadHostRuntime().timelineDisclosure;

export const useVibePadVoiceCatalogStore = () =>
  useVibePadHostRuntime().voiceCatalog;

export const useVibePadWorkspaceStore = () => useVibePadHostRuntime().workspace;

export const useVibePadWorkspaceUiStore = () =>
  useVibePadHostRuntime().workspaceUi;
