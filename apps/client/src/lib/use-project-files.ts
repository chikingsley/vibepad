import { useValue } from "@legendapp/state/react";
import { useEffect } from "react";

import {
  idleFileChangesState,
  idleFileContentState,
  idleFileNodesState,
} from "@/features/files/state/project-files-state";
import { useVibePadProjectFilesStore } from "@/lib/vibepad-host-context";

export function useProjectFiles(
  projectId: string,
  path: string,
  enabled: boolean
) {
  const store = useVibePadProjectFilesStore();

  useEffect(() => {
    if (enabled) {
      store.loadDirectory(projectId, path).catch(() => undefined);
    }
  }, [enabled, path, projectId, store]);

  return useValue(
    () =>
      store.state$.directoriesByProjectId[projectId]?.[path]?.get() ??
      idleFileNodesState
  );
}

export function useProjectFileContent(
  projectId: string,
  path: string | undefined,
  enabled: boolean
) {
  const store = useVibePadProjectFilesStore();

  useEffect(() => {
    if (enabled && path) {
      store.loadContent(projectId, path).catch(() => undefined);
    }
  }, [enabled, path, projectId, store]);

  return useValue(() =>
    path
      ? (store.state$.contentsByProjectId[projectId]?.[path]?.get() ??
        idleFileContentState)
      : idleFileContentState
  );
}

export function useProjectFileChanges(projectId: string, enabled: boolean) {
  const store = useVibePadProjectFilesStore();

  useEffect(() => {
    if (enabled) {
      store.loadChanges(projectId).catch(() => undefined);
    }
  }, [enabled, projectId, store]);

  return useValue(
    () =>
      store.state$.changesByProjectId[projectId]?.get() ?? idleFileChangesState
  );
}
