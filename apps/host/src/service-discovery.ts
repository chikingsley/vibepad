import { spawn } from "node:child_process";
import { isIP } from "node:net";
import { hostname as systemHostname } from "node:os";
import type { Readable } from "node:stream";

const trailingDotPattern = /\.$/u;
const whitespacePattern = /\s+/u;

export interface CommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export type CommandRunner = (
  executable: string,
  args: readonly string[]
) => Promise<CommandResult>;

export interface HostNetworkIdentity {
  readonly bindAddress: string;
  readonly dnsName?: string;
  readonly hostName: string;
}

export interface HostToolInventory {
  readonly agentBrowser?: string;
  readonly bun: string;
  readonly codex?: string;
  readonly opencode?: string;
  readonly tailscale: string;
}

interface TailscaleStatus {
  readonly Self?: {
    readonly DNSName?: string;
    readonly HostName?: string;
  };
}

const commandFailure = (
  executable: string,
  args: readonly string[],
  result: CommandResult
) => {
  const detail = result.stderr.trim() || result.stdout.trim();
  return new Error(
    `${[executable, ...args].join(" ")} exited ${result.exitCode}${detail ? `: ${detail}` : ""}`
  );
};

const collectOutput = (stream: Readable) =>
  new Promise<string>((resolve, reject) => {
    let output = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      output += chunk;
    });
    stream.once("end", () => resolve(output));
    stream.once("error", reject);
  });

export const runCommand: CommandRunner = async (executable, args) => {
  const child = spawn(executable, [...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    exited,
    collectOutput(child.stderr),
    collectOutput(child.stdout),
  ]);
  return { exitCode, stderr, stdout };
};

const requireCommand = async (
  runner: CommandRunner,
  executable: string,
  args: readonly string[]
) => {
  const result = await runner(executable, args);
  if (result.exitCode !== 0) {
    throw commandFailure(executable, args, result);
  }
  return result.stdout.trim();
};

const optionalExecutable = async (
  runner: CommandRunner,
  executable: string
) => {
  const result = await runner("sh", [
    "-c",
    'command -v "$1"',
    "vibepad",
    executable,
  ]);
  const path = result.stdout.trim();
  return result.exitCode === 0 && path ? path : undefined;
};

export const discoverHostTools = async (
  runner: CommandRunner,
  bunExecutable: string
): Promise<HostToolInventory> => {
  const [tailscale, codex, opencode, agentBrowser] = await Promise.all([
    optionalExecutable(runner, "tailscale"),
    optionalExecutable(runner, "codex"),
    optionalExecutable(runner, "opencode"),
    optionalExecutable(runner, "agent-browser"),
  ]);
  if (!tailscale) {
    throw new Error(
      "Tailscale is required before installing VibePad Host on a private address"
    );
  }
  return {
    ...(agentBrowser ? { agentBrowser } : {}),
    bun: bunExecutable,
    ...(codex ? { codex } : {}),
    ...(opencode ? { opencode } : {}),
    tailscale,
  };
};

export const parseTailscaleIPv4 = (output: string) => {
  const address = output
    .split(whitespacePattern)
    .map((value) => value.trim())
    .find((value) => isIP(value) === 4);
  if (!address) {
    throw new Error("Tailscale did not report an IPv4 address");
  }
  return address;
};

const shortHostName = (value: string) =>
  value.trim().replace(trailingDotPattern, "").split(".")[0]?.trim();

export const discoverTailscaleIdentity = async (
  runner: CommandRunner
): Promise<HostNetworkIdentity> => {
  const bindAddress = parseTailscaleIPv4(
    await requireCommand(runner, "tailscale", ["ip", "-4"])
  );
  const statusText = await requireCommand(runner, "tailscale", [
    "status",
    "--json",
  ]);
  let status: TailscaleStatus = {};
  try {
    status = JSON.parse(statusText) as TailscaleStatus;
  } catch (error) {
    throw new Error("Tailscale returned invalid status JSON", { cause: error });
  }
  const dnsName = status.Self?.DNSName?.replace(trailingDotPattern, "");
  const hostName =
    (dnsName ? shortHostName(dnsName) : undefined) ??
    shortHostName(status.Self?.HostName ?? "") ??
    shortHostName(systemHostname()) ??
    "vibepad-host";
  return {
    bindAddress,
    ...(dnsName ? { dnsName } : {}),
    hostName,
  };
};

export const assertSafeBindAddress = (
  address: string,
  allowPublicBind: boolean
) => {
  if (address === "0.0.0.0" && !allowPublicBind) {
    throw new Error(
      "Binding VibePad Host to 0.0.0.0 requires --allow-public-bind"
    );
  }
  if (address !== "localhost" && isIP(address) === 0) {
    throw new Error(
      `VibePad Host bind address is not an IP address: ${address}`
    );
  }
};
