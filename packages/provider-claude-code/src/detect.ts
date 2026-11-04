import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, sep } from "node:path";

export interface ClaudeCodeDetection {
  readonly available: boolean;
  readonly executablePath?: string;
  readonly source: "configured" | "known-path" | "path" | "none";
  readonly version?: string;
}

export interface DetectClaudeCodeOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Configured executable path or command name; checked before any search. */
  readonly executable?: string;
  readonly fileExists?: (path: string) => boolean;
  readonly homeDirectory?: string;
  readonly readTextFile?: (path: string) => string | undefined;
  readonly resolveRealPath?: (path: string) => string | undefined;
}

const defaultFileExists = (path: string) => {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
};

const defaultReadTextFile = (path: string) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    // Unreadable metadata just means no version is reported.
  }
};

const defaultResolveRealPath = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    // A broken symlink falls back to the original path.
  }
};

const versionSegment = /^\d+\.\d+\.\d+/u;

const versionFromPathSegments = (realPath: string) => {
  const segments = realPath.split(sep);
  for (const [index, segment] of segments.entries()) {
    if (segments[index - 1] === "versions" && versionSegment.test(segment)) {
      return versionSegment.exec(segment)?.[0];
    }
  }
};

const versionFromPackageMetadata = (
  realPath: string,
  readTextFile: (path: string) => string | undefined
) => {
  const packageDirectory = dirname(realPath);
  if (!packageDirectory.endsWith(join("@anthropic-ai", "claude-code"))) {
    return;
  }
  const raw = readTextFile(join(packageDirectory, "package.json"));
  if (!raw) {
    return;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      typeof parsed.version === "string"
    ) {
      return parsed.version;
    }
  } catch {
    // Invalid package metadata just means no version is reported.
  }
};

const detectionForExecutable = (
  path: string,
  source: ClaudeCodeDetection["source"],
  options: DetectClaudeCodeOptions
): ClaudeCodeDetection => {
  const readTextFile = options.readTextFile ?? defaultReadTextFile;
  const resolveRealPath = options.resolveRealPath ?? defaultResolveRealPath;
  const realPath = resolveRealPath(path) ?? path;
  const version =
    versionFromPathSegments(realPath) ??
    versionFromPackageMetadata(realPath, readTextFile);
  return {
    available: true,
    executablePath: path,
    source,
    ...(version ? { version } : {}),
  };
};

const searchPathDirectories = (
  env: Readonly<Record<string, string | undefined>>
) => (Reflect.get(env, "PATH") ?? "").split(delimiter).filter(Boolean);

const detectConfiguredExecutable = (
  executable: string,
  env: Readonly<Record<string, string | undefined>>,
  fileExists: (path: string) => boolean,
  options: DetectClaudeCodeOptions
): ClaudeCodeDetection => {
  if (isAbsolute(executable) || executable.includes(sep)) {
    return fileExists(executable)
      ? detectionForExecutable(executable, "configured", options)
      : { available: false, source: "none" };
  }
  for (const directory of searchPathDirectories(env)) {
    const candidate = join(directory, executable);
    if (fileExists(candidate)) {
      return detectionForExecutable(candidate, "configured", options);
    }
  }
  return { available: false, source: "none" };
};

/**
 * Locates a Claude Code CLI installation without ever invoking it. Presence
 * gates VibePad's claude-code harness; the version is read from install
 * metadata (native-installer version directories or the npm package manifest)
 * when cheaply available, and omitted otherwise.
 */
export const detectClaudeCode = (
  options: DetectClaudeCodeOptions = {}
): ClaudeCodeDetection => {
  const env = options.env ?? process.env;
  const fileExists = options.fileExists ?? defaultFileExists;
  const home = options.homeDirectory ?? homedir();

  if (options.executable) {
    return detectConfiguredExecutable(
      options.executable,
      env,
      fileExists,
      options
    );
  }

  for (const directory of searchPathDirectories(env)) {
    const candidate = join(directory, "claude");
    if (fileExists(candidate)) {
      return detectionForExecutable(candidate, "path", options);
    }
  }

  const knownPaths = [
    join(home, ".claude", "local", "claude"),
    join(home, ".local", "bin", "claude"),
    join(home, ".bun", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];
  for (const candidate of knownPaths) {
    if (fileExists(candidate)) {
      return detectionForExecutable(candidate, "known-path", options);
    }
  }

  return { available: false, source: "none" };
};
