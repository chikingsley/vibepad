import type { HostProfile } from "@vibepad/protocol/settings";

import {
  reconcileComputerRecords,
  reportComputerConnection,
} from "./state/computer-connections";

export interface ComputerCheckDependencies {
  readonly fetch: typeof globalThis.fetch;
  readonly report: typeof reportComputerConnection;
  readonly wait: (milliseconds: number) => Promise<void>;
}

const checkStaggerMilliseconds = 300;
const healthTimeoutMilliseconds = 3000;
const trailingSlashPattern = /\/$/u;

const defaultDependencies: ComputerCheckDependencies = {
  fetch: (input, init) => globalThis.fetch(input, init),
  report: reportComputerConnection,
  wait: (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
};

const probeComputer = async (
  host: HostProfile,
  dependencies: ComputerCheckDependencies
) => {
  dependencies.report(host.id, "connecting");
  try {
    const response = await Promise.race([
      dependencies.fetch(
        `${host.url.replace(trailingSlashPattern, "")}/health`
      ),
      dependencies.wait(healthTimeoutMilliseconds).then(() => {
        throw new Error("VibePad Host health check timed out.");
      }),
    ]);
    if (response.ok) {
      dependencies.report(host.id, "connected");
      return;
    }
    dependencies.report(
      host.id,
      "attention",
      `VibePad Host responded ${response.status}.`
    );
  } catch {
    dependencies.report(host.id, "offline", "This computer is unreachable.");
  }
};

export const checkSavedComputers = async (
  hosts: readonly HostProfile[],
  activeHostId: string | null | undefined,
  dependencies: ComputerCheckDependencies = defaultDependencies
): Promise<void> => {
  const savedComputers = hosts.filter((host) => host.id !== activeHostId);
  for (const [index, host] of savedComputers.entries()) {
    if (index > 0) {
      // biome-ignore lint/performance/noAwaitInLoops: Saved computers are probed one at a time so the checks stay staggered.
      await dependencies.wait(checkStaggerMilliseconds);
    }
    await probeComputer(host, dependencies);
  }
};

export const runSavedComputerChecks = (
  hosts: readonly HostProfile[],
  activeHostId: string | null | undefined
) => {
  reconcileComputerRecords(hosts);
  return checkSavedComputers(hosts, activeHostId);
};
