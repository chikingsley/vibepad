import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const installer = join(repositoryRoot, "scripts", "install-host.sh");
const temporaryDirectories: string[] = [];

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "vibepad-uninstall-test-"));
  temporaryDirectories.push(root);
  const home = join(root, "home");
  const installDirectory = join(root, "install");
  const stateDirectory = join(root, "state", "vibepad");
  const commandDirectory = join(home, ".local", "bin");
  const serviceDirectory = join(home, ".config", "systemd", "user");
  const configDirectory = join(home, ".config", "vibepad");
  const fakeBin = join(root, "bin");
  for (const directory of [
    join(installDirectory, "releases", "v1"),
    join(installDirectory, "browser"),
    stateDirectory,
    commandDirectory,
    serviceDirectory,
    configDirectory,
    fakeBin,
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(join(installDirectory, "run-host.sh"), "host\n");
  writeFileSync(join(stateDirectory, "host.db"), "pairing\n");
  writeFileSync(join(configDirectory, "host.env"), "VIBEPAD_PORT=4100\n");
  writeFileSync(join(serviceDirectory, "vibepad-host.service"), "service\n");
  symlinkSync(
    join(installDirectory, "releases", "v1"),
    join(installDirectory, "current")
  );
  symlinkSync(
    join(installDirectory, "current", "bin", "vibepad-host"),
    join(commandDirectory, "vibepad-host")
  );
  const systemctl = join(fakeBin, "systemctl");
  writeFileSync(systemctl, "#!/bin/sh\nexit 0\n");
  chmodSync(systemctl, 0o755);
  return {
    configDirectory,
    home,
    installDirectory,
    paths: {
      browser: join(installDirectory, "browser"),
      command: join(commandDirectory, "vibepad-host"),
      current: join(installDirectory, "current"),
      releases: join(installDirectory, "releases"),
      runner: join(installDirectory, "run-host.sh"),
      service: join(serviceDirectory, "vibepad-host.service"),
      state: stateDirectory,
    },
    root,
    run: (action: "reset" | "uninstall") =>
      spawnSync(
        "bash",
        [installer, action, "--install-dir", installDirectory],
        {
          encoding: "utf8",
          env: {
            HOME: home,
            PATH: `${fakeBin}:/usr/bin:/bin`,
            XDG_STATE_HOME: join(root, "state"),
          },
        }
      ),
  };
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("VibePad Host installer removal actions", () => {
  it("uninstalls VibePad files while preserving pairing and configuration", () => {
    const test = fixture();
    const result = test.run("uninstall");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "pairing data and host configuration are preserved"
    );
    for (const path of [
      test.paths.browser,
      test.paths.command,
      test.paths.current,
      test.paths.releases,
      test.paths.runner,
      test.paths.service,
    ]) {
      expect(existsSync(path)).toBe(false);
    }
    expect(existsSync(test.configDirectory)).toBe(true);
    expect(existsSync(test.paths.state)).toBe(true);
  });

  it("resets all VibePad Host data while preserving external tools", () => {
    const test = fixture();
    const result = test.run("reset");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Bun, Codex, OpenCode, Tailscale, SSH keys, and project files are preserved"
    );
    expect(existsSync(test.installDirectory)).toBe(false);
    expect(existsSync(test.configDirectory)).toBe(false);
    expect(existsSync(test.paths.state)).toBe(false);
  });
});
