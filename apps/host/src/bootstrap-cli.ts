import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import {
  authenticateProvider,
  installManagedToolchain,
  type ManagedToolSelection,
  managedToolchainReady,
  managedToolVersions,
  providerAuthenticationStatus,
} from "./managed-toolchain";
import { HostServiceManager } from "./service-manager";

const usage = `VibePad blank-host bootstrap

Usage:
  bun apps/host/src/bootstrap-cli.ts [options]

Options:
  --yes                       Consent to all selected managed-tool installs
  --without-codex             Do not install or enable Codex
  --without-opencode          Do not install or enable OpenCode
  --without-browser           Do not install Agent Browser and Chrome
  --skip-browser-download     Install Agent Browser without downloading Chrome
  --browser-system-deps       Let Agent Browser install Linux system dependencies
  --allow-unauthenticated     Install providers before their provider-owned login
  --bind <address>            Override automatic Tailscale IPv4 binding
  --allow-public-bind         Permit an explicit 0.0.0.0 binding
  --host-name <name>          Override the short Tailscale machine name
  --port <port>               Host port (default 4100)
  --project-root <path>       Add a Codex project root; repeat as needed
  --no-start                  Install without starting the host service
`;
const affirmativePattern = /^y(?:es)?$/iu;

class HelpRequested extends Error {}

interface BootstrapOptions {
  readonly allowPublicBind?: boolean;
  readonly allowUnauthenticated?: boolean;
  readonly bindAddress?: string;
  readonly browserSystemDependencies?: boolean;
  readonly hostName?: string;
  readonly installBrowser: boolean;
  readonly port?: number;
  readonly projectRoots?: string[];
  readonly selection: ManagedToolSelection;
  readonly start?: boolean;
  readonly yes?: boolean;
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

interface BootstrapParserState {
  installBrowser: boolean;
  readonly options: {
    allowPublicBind?: boolean;
    allowUnauthenticated?: boolean;
    bindAddress?: string;
    browserSystemDependencies?: boolean;
    hostName?: string;
    port?: number;
    start?: boolean;
    yes?: boolean;
  };
  readonly projectRoots: string[];
  readonly selection: {
    agentBrowser: boolean;
    codex: boolean;
    openCode: boolean;
  };
}

const applyFlag = (argument: string, state: BootstrapParserState) => {
  switch (argument) {
    case "--yes":
      state.options.yes = true;
      return true;
    case "--without-codex":
      state.selection.codex = false;
      return true;
    case "--without-opencode":
      state.selection.openCode = false;
      return true;
    case "--without-browser":
      state.selection.agentBrowser = false;
      return true;
    case "--skip-browser-download":
      state.installBrowser = false;
      return true;
    case "--browser-system-deps":
      state.options.browserSystemDependencies = true;
      return true;
    case "--allow-unauthenticated":
      state.options.allowUnauthenticated = true;
      return true;
    case "--allow-public-bind":
      state.options.allowPublicBind = true;
      return true;
    case "--no-start":
      state.options.start = false;
      return true;
    case "--help":
    case "-h":
      console.info(usage);
      throw new HelpRequested();
    default:
      return false;
  }
};

const applyValue = (
  args: readonly string[],
  index: number,
  state: BootstrapParserState
) => {
  const argument = args[index];
  if (argument === "--bind") {
    state.options.bindAddress = requiredValue(args, index, argument);
    return true;
  }
  if (argument === "--host-name") {
    state.options.hostName = requiredValue(args, index, argument);
    return true;
  }
  if (argument === "--port") {
    state.options.port = Number(requiredValue(args, index, argument));
    return true;
  }
  if (argument === "--project-root") {
    state.projectRoots.push(requiredValue(args, index, argument));
    return true;
  }
  return false;
};

const parseOptions = (args: readonly string[]): BootstrapOptions => {
  const state: BootstrapParserState = {
    installBrowser: true,
    options: {},
    projectRoots: [],
    selection: { agentBrowser: true, codex: true, openCode: true },
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (applyFlag(argument, state)) {
      continue;
    }
    if (applyValue(args, index, state)) {
      index += 1;
    } else {
      throw new Error(`Unknown bootstrap option: ${argument}`);
    }
  }
  if (!(state.selection.codex || state.selection.openCode)) {
    throw new Error("Select at least one Codex or OpenCode harness");
  }
  return {
    ...state.options,
    installBrowser: state.installBrowser,
    ...(state.projectRoots.length > 0
      ? { projectRoots: state.projectRoots }
      : {}),
    selection: state.selection,
  };
};

const promptForConsent = async (message: string) => {
  if (!(stdin.isTTY && stdout.isTTY)) {
    throw new Error(
      `${message} Re-run with --yes to consent non-interactively.`
    );
  }
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await terminal.question(`${message} [y/N] `);
    return affirmativePattern.test(answer.trim());
  } finally {
    terminal.close();
  }
};

const toolchainDescription = (selection: ManagedToolSelection) =>
  [
    ...(selection.codex ? [`Codex ${managedToolVersions.codex}`] : []),
    ...(selection.openCode ? [`OpenCode ${managedToolVersions.openCode}`] : []),
    ...(selection.agentBrowser
      ? [`Agent Browser ${managedToolVersions.agentBrowser}`]
      : []),
  ].join(", ");

const verifyProviderAuthentication = async (
  provider: "codex" | "opencode",
  executable: string,
  options: BootstrapOptions
) => {
  let status = await providerAuthenticationStatus(provider, executable);
  if (status.authenticated || options.allowUnauthenticated) {
    return status;
  }
  const loginMessage = `${provider === "codex" ? "Codex" : "OpenCode"} needs provider-owned authentication.`;
  const authenticate =
    options.yes && stdin.isTTY
      ? true
      : await promptForConsent(`${loginMessage} Authenticate now?`);
  if (!authenticate) {
    throw new Error(
      `${loginMessage} Run ${executable} ${provider === "codex" ? "login" : "auth login"}, then rerun the bootstrap.`
    );
  }
  await authenticateProvider(provider, executable);
  status = await providerAuthenticationStatus(provider, executable);
  if (!status.authenticated) {
    throw new Error(
      `${loginMessage} The login command did not verify a credential.`
    );
  }
  return status;
};

const main = async () => {
  const options = parseOptions(process.argv.slice(2));
  const manager = new HostServiceManager({ bunExecutable: process.execPath });
  const before = await manager.inspect();
  const alreadyReady = await managedToolchainReady(options.selection);
  if (!(alreadyReady || options.yes)) {
    const consented = await promptForConsent(
      `Install VibePad-owned ${toolchainDescription(options.selection)} without changing global installations or provider credentials?`
    );
    if (!consented) {
      throw new Error("VibePad managed-tool installation was declined");
    }
  }
  const toolchain = await installManagedToolchain({
    ...(options.browserSystemDependencies
      ? { browserSystemDependencies: true }
      : {}),
    bunExecutable: process.execPath,
    installBrowser: options.installBrowser,
    selection: options.selection,
  });
  const authentication = await Promise.all([
    ...(toolchain.codex
      ? [verifyProviderAuthentication("codex", toolchain.codex, options)]
      : []),
    ...(toolchain.openCode
      ? [verifyProviderAuthentication("opencode", toolchain.openCode, options)]
      : []),
  ]);
  const service = await manager.install({
    ...(toolchain.agentBrowser
      ? { agentBrowserExecutable: toolchain.agentBrowser }
      : {}),
    ...(options.allowPublicBind ? { allowPublicBind: true } : {}),
    ...(options.bindAddress ? { bindAddress: options.bindAddress } : {}),
    codexEnabled: options.selection.codex,
    ...(toolchain.codex ? { codexExecutable: toolchain.codex } : {}),
    ...(options.hostName ? { hostName: options.hostName } : {}),
    openCodeEnabled: options.selection.openCode,
    ...(toolchain.openCode ? { openCodeExecutable: toolchain.openCode } : {}),
    openCodeManaged: options.selection.openCode,
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.projectRoots ? { projectRoots: options.projectRoots } : {}),
    skipDependencies: true,
    start: options.start ?? true,
  });
  if (service.started && !service.healthy) {
    throw new Error(
      `VibePad Host did not become healthy at ${service.healthUrl}`
    );
  }
  const pairing = await manager.createPairingCode();
  console.info(
    JSON.stringify(
      {
        authentication: authentication.map((status) => ({
          authenticated: status.authenticated,
          provider: status.provider,
        })),
        before: {
          identity: before.identity,
          systemTools: before.tools,
        },
        managedTools: toolchain,
        pairing,
        service,
      },
      null,
      2
    )
  );
};

main().catch((error: unknown) => {
  if (error instanceof HelpRequested) {
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
