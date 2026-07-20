import type {
  WorkspaceFileChange,
  WorkspaceFileContent,
  WorkspaceFileNode,
} from "@vibepad/protocol/files";

export type ProjectFileListState<T> =
  | { readonly data: readonly T[]; readonly status: "idle" }
  | { readonly data: readonly T[]; readonly status: "loading" }
  | {
      readonly data: readonly T[];
      readonly message: string;
      readonly status: "error";
    }
  | { readonly data: readonly T[]; readonly status: "ready" };

export type ProjectFileContentState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly message: string; readonly status: "error" }
  | { readonly data: WorkspaceFileContent; readonly status: "ready" };

export interface ProjectFilesState {
  changesByProjectId: Record<string, ProjectFileListState<WorkspaceFileChange>>;
  contentsByProjectId: Record<string, Record<string, ProjectFileContentState>>;
  directoriesByProjectId: Record<
    string,
    Record<string, ProjectFileListState<WorkspaceFileNode>>
  >;
}

export const idleFileChangesState: ProjectFileListState<WorkspaceFileChange> = {
  data: [],
  status: "idle",
};

export const idleFileContentState: ProjectFileContentState = {
  status: "idle",
};

export const idleFileNodesState: ProjectFileListState<WorkspaceFileNode> = {
  data: [],
  status: "idle",
};
