import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";

import { runCommand } from "./service-discovery";

export const managedToolVersions = {
  agentBrowser: "0.32.2",
  codex: "0.144.6",
  openCode: "1.18.3",
} as const;

export interface ManagedToolSelection {
  readonly agentBrowser: boolean;
  readonly codex: boolean;
  readonly openCode: boolean;
}

export interface ManagedToolchain {
  readonly agentBrowser?: string;
  readonly codex?: string;
  readonly directory: string;
  readonly openCode?: string;
  readonly versions: Readonly<Partial<typeof managedToolVersions>>;
}

export interface ProviderAuthenticationStatus {
  readonly authenticated: boolean;
  readonly detail: string;
  readonly provider: "codex" | "opencode";
}

const packageNames = {
  agentBrowser: "agent-browser",
  codex: "@openai/codex",
  openCode: "opencode-ai",
} as const;

const binaryNames = {
  agentBrowser: "agent-browser",
  codex: "codex",
  openCode: "opencode",
} as const;
const codexAuthenticatedPattern = /logged in/iu;
const openCodeAuthenticatedPattern = /\b[1-9][0-9]*\s+credentials?\b/iu;

const fileExists = async (path: string) => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const readIfPresent = async (path: string) => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
};

const writeAtomic = async (path: string, content: string) => {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
};

const runVisibleCommand = (
  executable: string,
  args: readonly string[],
  cwd?: string
) =>
  new Promise<void>((resolveExit, rejectExit) => {
    const child = spawn(executable, [...args], {
      ...(cwd ? { cwd } : {}),
      stdio: "inherit",
    });
    child.once("error", rejectExit);
    child.once("exit", (code) => {
      if (code === 0) {
        resolveExit();
        return;
      }
      rejectExit(
        new Error(`${[executable, ...args].join(" ")} exited ${code ?? 1}`)
      );
    });
  });

const dependencyEntries = (selection: ManagedToolSelection) => {
  const entries: [string, string][] = [];
  if (selection.agentBrowser) {
    entries.push([packageNames.agentBrowser, managedToolVersions.agentBrowser]);
  }
  if (selection.codex) {
    entries.push([packageNames.codex, managedToolVersions.codex]);
  }
  if (selection.openCode) {
    entries.push([packageNames.openCode, managedToolVersions.openCode]);
  }
  return entries;
};

const renderPackageManifest = (selection: ManagedToolSelection) => {
  const dependencies = Object.fromEntries(dependencyEntries(selection));
  return `${JSON.stringify(
    {
      dependencies,
      name: "vibepad-managed-host-tools",
      private: true,
      trustedDependencies: Object.keys(dependencies),
      version: "0.0.0",
    },
    null,
    2
  )}\n`;
};

export const managedToolsDirectory = (
  targetPlatform = platform(),
  homeDirectory = homedir()
) =>
  targetPlatform === "darwin"
    ? join(homeDirectory, "Library", "Application Support", "VibePad", "tools")
    : join(homeDirectory, ".local", "share", "vibepad", "tools");

const executablePath = (
  toolsDirectory: string,
  tool: keyof typeof binaryNames
) => join(toolsDirectory, "node_modules", ".bin", binaryNames[tool]);

const assertVersion = async (executable: string, expectedVersion: string) => {
  const result = await runCommand(executable, ["--version"]);
  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (result.exitCode !== 0 || !output.includes(expectedVersion)) {
    throw new Error(
      `${executable} reported ${JSON.stringify(output)}, expected ${expectedVersion}`
    );
  }
};

const selectedExecutables = (
  selection: ManagedToolSelection,
  toolsDirectory: string
) => ({
  ...(selection.agentBrowser
    ? { agentBrowser: executablePath(toolsDirectory, "agentBrowser") }
    : {}),
  ...(selection.codex
    ? { codex: executablePath(toolsDirectory, "codex") }
    : {}),
  ...(selection.openCode
    ? { openCode: executablePath(toolsDirectory, "openCode") }
    : {}),
});

const assertSelectedVersions = async (
  executables: ReturnType<typeof selectedExecutables>
) => {
  await Promise.all([
    ...(executables.agentBrowser
      ? [
          assertVersion(
            executables.agentBrowser,
            managedToolVersions.agentBrowser
          ),
        ]
      : []),
    ...(executables.codex
      ? [assertVersion(executables.codex, managedToolVersions.codex)]
      : []),
    ...(executables.openCode
      ? [assertVersion(executables.openCode, managedToolVersions.openCode)]
      : []),
  ]);
};

const installedToolchain = (
  executables: ReturnType<typeof selectedExecutables>,
  toolsDirectory: string
): ManagedToolchain => ({
  ...executables,
  directory: toolsDirectory,
  versions: {
    ...(executables.agentBrowser
      ? { agentBrowser: managedToolVersions.agentBrowser }
      : {}),
    ...(executables.codex ? { codex: managedToolVersions.codex } : {}),
    ...(executables.openCode ? { openCode: managedToolVersions.openCode } : {}),
  },
});

export const managedToolchainReady = async (
  selection: ManagedToolSelection,
  toolsDirectory = managedToolsDirectory()
) => {
  const required = [
    ...(selection.agentBrowser
      ? ([["agentBrowser", managedToolVersions.agentBrowser]] as const)
      : []),
    ...(selection.codex
      ? ([["codex", managedToolVersions.codex]] as const)
      : []),
    ...(selection.openCode
      ? ([["openCode", managedToolVersions.openCode]] as const)
      : []),
  ] satisfies readonly (readonly [keyof typeof binaryNames, string])[];
  try {
    await Promise.all(
      required.map(([tool, version]) =>
        assertVersion(executablePath(toolsDirectory, tool), version)
      )
    );
    return true;
  } catch {
    return false;
  }
};

export const installManagedToolchain = async (options: {
  readonly browserSystemDependencies?: boolean;
  readonly bunExecutable: string;
  readonly installBrowser?: boolean;
  readonly selection: ManagedToolSelection;
  readonly toolsDirectory?: string;
}): Promise<ManagedToolchain> => {
  const toolsDirectory = options.toolsDirectory ?? managedToolsDirectory();
  await mkdir(toolsDirectory, { mode: 0o700, recursive: true });
  await chmod(toolsDirectory, 0o700);
  const packagePath = join(toolsDirectory, "package.json");
  const manifest = renderPackageManifest(options.selection);
  const manifestChanged = (await readIfPresent(packagePath)) !== manifest;
  if (manifestChanged) {
    await writeAtomic(packagePath, manifest);
  }
  const lockPresent =
    (await fileExists(join(toolsDirectory, "bun.lock"))) ||
    (await fileExists(join(toolsDirectory, "bun.lockb")));
  await runVisibleCommand(
    options.bunExecutable,
    [
      "install",
      ...(lockPresent && !manifestChanged ? ["--frozen-lockfile"] : []),
    ],
    toolsDirectory
  );

  const executables = selectedExecutables(options.selection, toolsDirectory);
  await assertSelectedVersions(executables);
  if (executables.agentBrowser && options.installBrowser !== false) {
    await runVisibleCommand(executables.agentBrowser, [
      "install",
      ...(options.browserSystemDependencies ? ["--with-deps"] : []),
    ]);
  }
  return installedToolchain(executables, toolsDirectory);
};

export const providerAuthenticationStatus = async (
  provider: "codex" | "opencode",
  executable: string
): Promise<ProviderAuthenticationStatus> => {
  const result =
    provider === "codex"
      ? await runCommand(executable, ["login", "status"])
      : await runCommand(executable, ["auth", "list"]);
  const detail = `${result.stdout}\n${result.stderr}`.trim();
  const authenticated =
    result.exitCode === 0 &&
    (provider === "codex"
      ? codexAuthenticatedPattern.test(detail)
      : openCodeAuthenticatedPattern.test(detail));
  return { authenticated, detail, provider };
};

export const authenticateProvider = async (
  provider: "codex" | "opencode",
  executable: string
) => {
  await runVisibleCommand(
    executable,
    provider === "codex" ? ["login"] : ["auth", "login"]
  );
};
