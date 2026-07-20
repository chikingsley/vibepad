import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "..");
const outputRoot = join(packageRoot, "generated");
const temporaryRoot = mkdtempSync(join(tmpdir(), "vibepad-codex-bindings-"));

const roots = [
  "GitDiffToRemoteParams.ts",
  "GitDiffToRemoteResponse.ts",
  "InitializeParams.ts",
  "InitializeResponse.ts",
  "ReviewDecision.ts",
  "v2/CollaborationModeListParams.ts",
  "v2/CollaborationModeListResponse.ts",
  "v2/CommandExecutionRequestApprovalParams.ts",
  "v2/CommandExecutionRequestApprovalResponse.ts",
  "v2/CurrentTimeReadResponse.ts",
  "v2/FileChangeRequestApprovalParams.ts",
  "v2/FileChangeRequestApprovalResponse.ts",
  "v2/FsReadDirectoryParams.ts",
  "v2/FsReadDirectoryResponse.ts",
  "v2/FsReadFileParams.ts",
  "v2/FsReadFileResponse.ts",
  "v2/GetAccountParams.ts",
  "v2/GetAccountResponse.ts",
  "v2/ListMcpServerStatusParams.ts",
  "v2/ListMcpServerStatusResponse.ts",
  "v2/McpServerElicitationRequestParams.ts",
  "v2/McpServerElicitationRequestResponse.ts",
  "v2/ModelListParams.ts",
  "v2/ModelListResponse.ts",
  "v2/PermissionsRequestApprovalParams.ts",
  "v2/PermissionsRequestApprovalResponse.ts",
  "v2/SkillsListParams.ts",
  "v2/SkillsListResponse.ts",
  "v2/Thread.ts",
  "v2/ThreadArchiveParams.ts",
  "v2/ThreadDeleteParams.ts",
  "v2/ThreadListParams.ts",
  "v2/ThreadListResponse.ts",
  "v2/ThreadReadParams.ts",
  "v2/ThreadReadResponse.ts",
  "v2/ThreadResumeParams.ts",
  "v2/ThreadResumeResponse.ts",
  "v2/ThreadSetNameParams.ts",
  "v2/ThreadSettingsUpdateParams.ts",
  "v2/ThreadStartParams.ts",
  "v2/ThreadStartResponse.ts",
  "v2/ThreadTurnsListParams.ts",
  "v2/ThreadTurnsListResponse.ts",
  "v2/ToolRequestUserInputParams.ts",
  "v2/ToolRequestUserInputResponse.ts",
  "v2/TurnCompletedNotification.ts",
  "v2/TurnInterruptParams.ts",
  "v2/TurnStartParams.ts",
  "v2/TurnStartResponse.ts",
  "v2/TurnStartedNotification.ts",
] as const;

const generated = spawnSync(
  "codex",
  ["app-server", "generate-ts", "--experimental", "--out", temporaryRoot],
  { encoding: "utf8" }
);
if (generated.status !== 0) {
  throw new Error(
    generated.stderr ||
      generated.error?.message ||
      "Codex binding generation failed"
  );
}

const imports = /from\s+["'](\.[^"']+)["']/g;
const selected = new Set<string>();
const visit = (relativePath: string) => {
  const normalized = relativePath.endsWith(".ts")
    ? relativePath
    : `${relativePath}.ts`;
  if (selected.has(normalized)) {
    return;
  }
  const sourcePath = join(temporaryRoot, normalized);
  if (!existsSync(sourcePath)) {
    throw new Error(`Generated Codex binding missing: ${normalized}`);
  }
  selected.add(normalized);
  const source = readFileSync(sourcePath, "utf8");
  for (const match of source.matchAll(imports)) {
    const [, imported] = match;
    if (!imported) {
      continue;
    }
    visit(relative(temporaryRoot, resolve(dirname(sourcePath), imported)));
  }
};

try {
  for (const root of roots) {
    visit(root);
  }
  rmSync(outputRoot, { force: true, recursive: true });
  for (const relativePath of [...selected].sort()) {
    const destination = join(outputRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(temporaryRoot, relativePath), destination);
  }
  const version = spawnSync("codex", ["--version"], { encoding: "utf8" });
  if (version.status !== 0) {
    throw new Error(
      version.stderr || version.error?.message || "Unable to read Codex version"
    );
  }
  writeFileSync(join(outputRoot, "VERSION"), `${version.stdout.trim()}\n`);
  console.info(`Wrote ${selected.size} Codex bindings to ${outputRoot}`);
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
