import { spawn } from "node:child_process";

import { serviceLabel, systemdUnitName } from "./service-files";
import { HostServiceManager } from "./service-manager";

const usage = `VibePad Host service

Usage:
  bun run --filter @vibepad/host service inspect
  bun run --filter @vibepad/host service install [options]
  bun run --filter @vibepad/host service status
  bun run --filter @vibepad/host service pair
  bun run --filter @vibepad/host service restart
  bun run --filter @vibepad/host service logs
  bun run --filter @vibepad/host service uninstall

Install options:
  --bind <address>       Override automatic Tailscale IPv4 binding
  --allow-public-bind    Permit an explicit 0.0.0.0 binding
  --host-name <name>     Override the short Tailscale machine name
  --port <port>          Host port (default 4100)
  --project-root <path>  Add a Codex project root; repeat as needed
  --no-start             Write service files without starting the service
  --skip-dependencies    Skip bun install --frozen-lockfile
`;

interface ParsedInstallOptions {
  allowPublicBind?: boolean;
  bindAddress?: string;
  hostName?: string;
  port?: number;
  projectRoots?: string[];
  skipDependencies?: boolean;
  start?: boolean;
}

const requiredValue = (
  args: readonly string[],
  index: number,
  flag: string
) => {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
};

const parseInstallOptions = (args: readonly string[]): ParsedInstallOptions => {
  const options: ParsedInstallOptions = {};
  const projectRoots: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--allow-public-bind") {
      options.allowPublicBind = true;
    } else if (argument === "--bind") {
      options.bindAddress = requiredValue(args, index, argument);
      index += 1;
    } else if (argument === "--host-name") {
      options.hostName = requiredValue(args, index, argument);
      index += 1;
    } else if (argument === "--port") {
      options.port = Number(requiredValue(args, index, argument));
      index += 1;
    } else if (argument === "--project-root") {
      projectRoots.push(requiredValue(args, index, argument));
      index += 1;
    } else if (argument === "--no-start") {
      options.start = false;
    } else if (argument === "--skip-dependencies") {
      options.skipDependencies = true;
    } else {
      throw new Error(`Unknown install option: ${argument}`);
    }
  }
  if (projectRoots.length > 0) {
    options.projectRoots = projectRoots;
  }
  return options;
};

const streamLogs = () => {
  const command =
    process.platform === "darwin"
      ? [
          "sh",
          "-c",
          'tail -n 100 -F "$HOME/Library/Logs/VibePad/host.log" "$HOME/Library/Logs/VibePad/host.error.log"',
        ]
      : ["journalctl", "--user", "-u", systemdUnitName, "-n", "100", "-f"];
  const [executable, ...args] = command;
  if (!executable) {
    throw new Error("No log command is available on this platform");
  }
  const child = spawn(executable, args, {
    stdio: "inherit",
  });
  return new Promise<number>((resolveExitCode, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExitCode(code ?? 1));
  });
};

const main = async () => {
  const [command, ...args] = process.argv.slice(2);
  const manager = new HostServiceManager();
  if (!command || command === "help" || command === "--help") {
    console.info(usage);
    return;
  }
  if (command === "inspect") {
    console.info(JSON.stringify(await manager.inspect(), null, 2));
    return;
  }
  if (command === "install") {
    const result = await manager.install(parseInstallOptions(args));
    console.info(JSON.stringify(result, null, 2));
    if (!result.healthy && result.started) {
      throw new Error(
        `VibePad Host did not become healthy at ${result.healthUrl}; inspect service logs`
      );
    }
    return;
  }
  if (command === "status") {
    console.info(JSON.stringify(await manager.status(), null, 2));
    return;
  }
  if (command === "pair") {
    console.info(JSON.stringify(await manager.createPairingCode(), null, 2));
    return;
  }
  if (command === "restart") {
    const result = await manager.restart();
    console.info(JSON.stringify(result, null, 2));
    if (!result.healthy) {
      throw new Error(
        `Restarted ${serviceLabel}, but it did not become healthy at ${result.healthUrl}`
      );
    }
    return;
  }
  if (command === "logs") {
    process.exitCode = await streamLogs();
    return;
  }
  if (command === "uninstall") {
    await manager.uninstall();
    console.info(
      "Removed the VibePad Host service; pairing data and host.env were preserved"
    );
    return;
  }
  throw new Error(`Unknown service command: ${command}\n\n${usage}`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
