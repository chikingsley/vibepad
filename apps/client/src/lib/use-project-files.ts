import type {
  WorkspaceFileChange,
  WorkspaceFileContent,
  WorkspaceFileNode,
} from "@vibepad/protocol/files";
import { useEffect, useState } from "react";

import { useVibePadHost } from "@/lib/vibepad-host-context";

type ListState<T> =
  | { readonly data: readonly T[]; readonly status: "idle" }
  | { readonly data: readonly T[]; readonly status: "loading" }
  | {
      readonly data: readonly T[];
      readonly message: string;
      readonly status: "error";
    }
  | { readonly data: readonly T[]; readonly status: "ready" };

type ContentState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly message: string; readonly status: "error" }
  | { readonly data: WorkspaceFileContent; readonly status: "ready" };

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown VibePad host error";

export function useProjectFiles(
  projectId: string,
  path: string,
  enabled: boolean
) {
  const host = useVibePadHost();
  const [state, setState] = useState<ListState<WorkspaceFileNode>>({
    data: [],
    status: "idle",
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    setState((current) => ({ data: current.data, status: "loading" }));
    host
      .listFiles(projectId, path, controller.signal)
      .then((data) => {
        setState({ data, status: "ready" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ data: [], message: errorMessage(error), status: "error" });
        }
      });

    return () => {
      controller.abort();
    };
  }, [enabled, host, path, projectId]);

  return state;
}

export function useProjectFileContent(
  projectId: string,
  path: string | undefined,
  enabled: boolean
) {
  const host = useVibePadHost();
  const [state, setState] = useState<ContentState>({ status: "idle" });

  useEffect(() => {
    if (!(enabled && path)) {
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    host
      .readFile(projectId, path, controller.signal)
      .then((data) => {
        setState({ data, status: "ready" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ message: errorMessage(error), status: "error" });
        }
      });

    return () => {
      controller.abort();
    };
  }, [enabled, host, path, projectId]);

  return state;
}

export function useProjectFileChanges(projectId: string, enabled: boolean) {
  const host = useVibePadHost();
  const [state, setState] = useState<ListState<WorkspaceFileChange>>({
    data: [],
    status: "idle",
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    setState((current) => ({ data: current.data, status: "loading" }));
    host
      .listFileChanges(projectId, controller.signal)
      .then((data) => {
        setState({ data, status: "ready" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ data: [], message: errorMessage(error), status: "error" });
        }
      });

    return () => {
      controller.abort();
    };
  }, [enabled, host, projectId]);

  return state;
}
