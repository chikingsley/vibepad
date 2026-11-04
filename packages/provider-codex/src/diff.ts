import type { WorkspaceFileChange } from "@vibepad/protocol/files";

const diffHeader = /^diff --git a\/(?<oldPath>.+) b\/(?<newPath>.+)$/u;

const finishChange = (
  lines: readonly string[],
  changes: WorkspaceFileChange[]
) => {
  if (lines.length === 0) {
    return;
  }
  const header = lines[0]?.match(diffHeader);
  if (!header) {
    return;
  }
  const [, previousPath, nextPath] = header;
  if (!(previousPath && nextPath)) {
    return;
  }
  const added = lines.some((line) => line.startsWith("new file mode "));
  const deleted = lines.some((line) => line.startsWith("deleted file mode "));
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions += 1;
    }
  }
  let status: WorkspaceFileChange["status"] = "modified";
  if (added) {
    status = "added";
  } else if (deleted) {
    status = "deleted";
  }
  changes.push({
    additions,
    deletions,
    patch: `${lines.join("\n")}\n`,
    path: deleted ? previousPath : nextPath,
    status,
  });
};

export const parseUnifiedDiff = (
  diff: string
): readonly WorkspaceFileChange[] => {
  const changes: WorkspaceFileChange[] = [];
  let current: string[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      finishChange(current, changes);
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  finishChange(current, changes);
  return changes;
};
