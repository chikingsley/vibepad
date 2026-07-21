export const workspaceUiSnapshotSchemaVersion = 1 as const;

export type PersistedWorkbenchSurface = "changes" | "files" | "preview";

export interface SessionWorkbenchLayout {
  readonly expanded: boolean;
  readonly open: boolean;
  readonly splitRatio: number;
  readonly surface: PersistedWorkbenchSurface;
}

export interface WorkspaceUiSnapshot {
  readonly desktopSidebarOpen: boolean;
  readonly expandedProjects: Record<string, boolean>;
  readonly schemaVersion: typeof workspaceUiSnapshotSchemaVersion;
  readonly workbenchesBySessionId: Record<string, SessionWorkbenchLayout>;
}

export const defaultWorkbenchLayout: SessionWorkbenchLayout = {
  expanded: false,
  open: false,
  splitRatio: 0.4,
  surface: "preview",
};

export const clampWorkbenchSplitRatio = (ratio: number) =>
  Math.min(0.68, Math.max(0.28, ratio));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const decodeWorkbench = (
  candidate: unknown
): SessionWorkbenchLayout | undefined => {
  if (!isRecord(candidate)) {
    return;
  }
  const { expanded, open, splitRatio, surface } = candidate;
  if (
    typeof expanded !== "boolean" ||
    typeof open !== "boolean" ||
    typeof splitRatio !== "number" ||
    !Number.isFinite(splitRatio) ||
    !["changes", "files", "preview"].includes(String(surface))
  ) {
    return;
  }
  return {
    expanded,
    open,
    splitRatio: clampWorkbenchSplitRatio(splitRatio),
    surface: surface as PersistedWorkbenchSurface,
  };
};

const decodeBooleanRecord = (candidate: unknown) => {
  if (!isRecord(candidate)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(candidate).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
    )
  );
};

const decodeWorkbenchRecord = (candidate: unknown) => {
  if (!isRecord(candidate)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(candidate).flatMap(([sessionId, value]) => {
      const workbench = decodeWorkbench(value);
      return workbench ? [[sessionId, workbench] as const] : [];
    })
  );
};

export const decodeWorkspaceUiSnapshot = (
  candidate: unknown
): WorkspaceUiSnapshot | undefined => {
  if (!isRecord(candidate)) {
    return;
  }
  const {
    desktopSidebarOpen,
    expandedProjects,
    schemaVersion,
    workbenchesBySessionId,
  } = candidate;
  if (
    schemaVersion !== workspaceUiSnapshotSchemaVersion ||
    typeof desktopSidebarOpen !== "boolean"
  ) {
    return;
  }
  return {
    desktopSidebarOpen,
    expandedProjects: decodeBooleanRecord(expandedProjects),
    schemaVersion: workspaceUiSnapshotSchemaVersion,
    workbenchesBySessionId: decodeWorkbenchRecord(workbenchesBySessionId),
  };
};
