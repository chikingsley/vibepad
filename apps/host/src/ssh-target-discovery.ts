import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  matchesGlob,
  resolve,
} from "node:path";
import type { SshTarget } from "@vibepad/protocol/remote";

import { type CommandRunner, runCommand } from "./service-discovery";

const patternCharacter = /[*?![\]]/u;
const whitespace = /\s+/u;
const tokenPattern = /"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\S+/gu;

const unquote = (value: string) => {
  const first = value.at(0);
  const last = value.at(-1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
};

const directiveTokens = (line: string) => {
  const content = line.split("#", 1)[0]?.trim() ?? "";
  return [...content.matchAll(tokenPattern)].map((match) => unquote(match[0]));
};

const expandHome = (path: string, homeDirectory: string) => {
  if (path === "~") {
    return homeDirectory;
  }
  if (path.startsWith("~/")) {
    return join(homeDirectory, path.slice(2));
  }
  return path;
};

const expandInclude = async (
  pattern: string,
  includingFile: string,
  homeDirectory: string
) => {
  const expanded = expandHome(pattern, homeDirectory);
  const absolute = isAbsolute(expanded)
    ? expanded
    : resolve(dirname(includingFile), expanded);
  if (!patternCharacter.test(absolute)) {
    return [absolute];
  }
  const directory = dirname(absolute);
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries
    .filter(
      (entry) => entry.isFile() && matchesGlob(entry.name, basename(absolute))
    )
    .map((entry) => join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
};

const concreteAliases = async (
  configPath: string,
  homeDirectory: string,
  visited = new Set<string>()
): Promise<string[]> => {
  const canonicalPath = resolve(configPath);
  if (visited.has(canonicalPath)) {
    return [];
  }
  visited.add(canonicalPath);
  let content: string;
  try {
    content = await readFile(canonicalPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const aliases: string[] = [];
  for (const line of content.split("\n")) {
    const [directive, ...values] = directiveTokens(line);
    if (!directive) {
      continue;
    }
    if (directive.toLowerCase() === "host") {
      aliases.push(
        ...values.filter(
          (value) =>
            value.length > 0 &&
            !value.startsWith("!") &&
            !patternCharacter.test(value)
        )
      );
      continue;
    }
    if (directive.toLowerCase() !== "include") {
      continue;
    }
    for (const value of values) {
      // biome-ignore lint/performance/noAwaitInLoops: OpenSSH Include order affects precedence and recursion tracking.
      const paths = await expandInclude(value, canonicalPath, homeDirectory);
      for (const path of paths) {
        // biome-ignore lint/performance/noAwaitInLoops: Includes are traversed in OpenSSH declaration order.
        aliases.push(...(await concreteAliases(path, homeDirectory, visited)));
      }
    }
  }
  return aliases;
};

const resolvedValues = (output: string) => {
  const values = new Map<string, string>();
  for (const line of output.split("\n")) {
    const [key, ...parts] = line.trim().split(whitespace);
    if (key && parts.length > 0 && !values.has(key)) {
      values.set(key.toLowerCase(), parts.join(" "));
    }
  }
  return values;
};

const resolveTarget = async (
  alias: string,
  runner: CommandRunner
): Promise<SshTarget | undefined> => {
  const result = await runner("ssh", ["-G", alias]);
  if (result.exitCode !== 0) {
    return;
  }
  const values = resolvedValues(result.stdout);
  const hostName = values.get("hostname");
  const user = values.get("user");
  const port = Number(values.get("port") ?? "22");
  if (
    !(hostName && user && Number.isInteger(port) && port > 0 && port < 65_536)
  ) {
    return;
  }
  return { alias, hostName, port, source: "ssh-config", user };
};

export interface SshTargetDiscovery {
  readonly listTargets: () => Promise<readonly SshTarget[]>;
}

export class OpenSshTargetDiscovery implements SshTargetDiscovery {
  readonly #configPath: string;
  readonly #homeDirectory: string;
  readonly #runner: CommandRunner;

  constructor(
    options: {
      readonly configPath?: string;
      readonly homeDirectory?: string;
      readonly runner?: CommandRunner;
    } = {}
  ) {
    this.#homeDirectory = options.homeDirectory ?? homedir();
    this.#configPath =
      options.configPath ?? join(this.#homeDirectory, ".ssh", "config");
    this.#runner = options.runner ?? runCommand;
  }

  async listTargets(): Promise<readonly SshTarget[]> {
    const aliases = [
      ...new Set(await concreteAliases(this.#configPath, this.#homeDirectory)),
    ];
    const resolved = await Promise.all(
      aliases.map((alias) => resolveTarget(alias, this.#runner))
    );
    const connections = new Set<string>();
    return resolved
      .filter((target): target is SshTarget => Boolean(target))
      .filter((target) => {
        const key = `${target.user}\u0000${target.hostName}\u0000${target.port}`;
        if (connections.has(key)) {
          return false;
        }
        connections.add(key);
        return true;
      })
      .sort((left, right) => left.alias.localeCompare(right.alias));
  }
}
