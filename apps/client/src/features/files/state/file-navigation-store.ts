import { type Observable, observable } from "@legendapp/state";

export interface FileNavigationRecord {
  currentPath: string;
  openFiles: string[];
  selectedChange: string | undefined;
  selectedFile: string | undefined;
}

export interface FileNavigationState {
  bySessionId: Record<string, FileNavigationRecord>;
}

export interface FileNavigationStore {
  readonly closeFile: (sessionId: string, path: string) => void;
  readonly moveToParent: (sessionId: string) => void;
  readonly openDirectory: (sessionId: string, path: string) => void;
  readonly openFile: (
    sessionId: string,
    path: string,
    additive: boolean
  ) => void;
  readonly selectChange: (sessionId: string, path: string) => void;
  readonly selectFile: (sessionId: string, path: string) => void;
  readonly state$: Observable<FileNavigationState>;
}

export const idleFileNavigation: FileNavigationRecord = {
  currentPath: "",
  openFiles: [],
  selectedChange: undefined,
  selectedFile: undefined,
};

const parentPath = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length > 0 ? `${parts.join("/")}/` : "";
};

export function createFileNavigationStore(): FileNavigationStore {
  const state$ = observable<FileNavigationState>({ bySessionId: {} });

  const read = (sessionId: string) =>
    state$.bySessionId[sessionId]?.peek() ?? idleFileNavigation;
  const write = (sessionId: string, value: FileNavigationRecord) => {
    state$.bySessionId.assign({ [sessionId]: value });
  };

  return {
    closeFile: (sessionId, path) => {
      const current = read(sessionId);
      const closingIndex = current.openFiles.indexOf(path);
      const openFiles = current.openFiles.filter(
        (candidate) => candidate !== path
      );
      const selectedFile =
        current.selectedFile === path
          ? openFiles[Math.min(Math.max(closingIndex, 0), openFiles.length - 1)]
          : current.selectedFile;
      write(sessionId, { ...current, openFiles, selectedFile });
    },
    moveToParent: (sessionId) => {
      const current = read(sessionId);
      write(sessionId, {
        ...current,
        currentPath: parentPath(current.currentPath),
      });
    },
    openDirectory: (sessionId, path) => {
      write(sessionId, { ...read(sessionId), currentPath: path });
    },
    openFile: (sessionId, path, additive) => {
      const current = read(sessionId);
      if (current.openFiles.includes(path)) {
        write(sessionId, { ...current, selectedFile: path });
        return;
      }
      let openFiles: string[];
      if (additive || !current.selectedFile) {
        openFiles = [...current.openFiles, path];
      } else {
        const selectedIndex = current.openFiles.indexOf(current.selectedFile);
        openFiles =
          selectedIndex < 0
            ? [path]
            : current.openFiles.map((candidate, index) =>
                index === selectedIndex ? path : candidate
              );
      }
      write(sessionId, { ...current, openFiles, selectedFile: path });
    },
    selectChange: (sessionId, path) => {
      write(sessionId, { ...read(sessionId), selectedChange: path });
    },
    selectFile: (sessionId, path) => {
      write(sessionId, { ...read(sessionId), selectedFile: path });
    },
    state$,
  };
}
