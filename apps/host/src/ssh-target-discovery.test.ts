import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { CommandRunner } from "./service-discovery";
import { OpenSshTargetDiscovery } from "./ssh-target-discovery";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

const targetOutput = (hostName: string, user: string, port = 22) =>
  `host ignored\nuser ${user}\nhostname ${hostName}\nport ${port}\n`;

describe("OpenSSH target discovery", () => {
  it("resolves concrete aliases, follows includes, and ignores patterns", async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), "vibepad-ssh-"));
    temporaryDirectories.push(homeDirectory);
    const sshDirectory = join(homeDirectory, ".ssh");
    const includedDirectory = join(sshDirectory, "config.d");
    await mkdir(includedDirectory, { recursive: true });
    await writeFile(
      join(sshDirectory, "config"),
      [
        "Include config.d/*",
        "Host hojo",
        "  HostName hojo",
        "Host *",
        "  ServerAliveInterval 30",
      ].join("\n")
    );
    await writeFile(
      join(includedDirectory, "work"),
      "Host hochi\n  HostName hochi\nHost build-*\n"
    );
    const runner: CommandRunner = (_executable, args) => {
      const alias = args.at(-1);
      const output =
        alias === "hojo"
          ? targetOutput("hojo", "Richstgo")
          : targetOutput("hochi", "simonpeacocks", 2222);
      return Promise.resolve({ exitCode: 0, stderr: "", stdout: output });
    };

    const discovery = new OpenSshTargetDiscovery({ homeDirectory, runner });

    await expect(discovery.listTargets()).resolves.toEqual([
      {
        alias: "hochi",
        hostName: "hochi",
        port: 2222,
        source: "ssh-config",
        user: "simonpeacocks",
      },
      {
        alias: "hojo",
        hostName: "hojo",
        port: 22,
        source: "ssh-config",
        user: "Richstgo",
      },
    ]);
  });

  it("collapses aliases that resolve to the same SSH connection", async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), "vibepad-ssh-"));
    temporaryDirectories.push(homeDirectory);
    await mkdir(join(homeDirectory, ".ssh"), { recursive: true });
    await writeFile(
      join(homeDirectory, ".ssh", "config"),
      "Host hojo macmini\n  HostName hojo\n"
    );
    const runner: CommandRunner = () =>
      Promise.resolve({
        exitCode: 0,
        stderr: "",
        stdout: targetOutput("hojo", "Richstgo"),
      });

    const discovery = new OpenSshTargetDiscovery({ homeDirectory, runner });

    await expect(discovery.listTargets()).resolves.toEqual([
      {
        alias: "hojo",
        hostName: "hojo",
        port: 22,
        source: "ssh-config",
        user: "Richstgo",
      },
    ]);
  });
});
