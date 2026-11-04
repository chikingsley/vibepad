import type { HostProfile } from "@vibepad/protocol/settings";
import type {
  SshRecoveryInput,
  SshRecoveryResult,
  // biome-ignore lint/correctness/noUndeclaredDependencies: This local Expo module resolves through the tsconfig path alias, not package.json.
} from "@vibepad/ssh-bootstrap";

interface SshRecoveryModule {
  readonly recoverHostAsync: (
    input: SshRecoveryInput
  ) => Promise<SshRecoveryResult>;
}

interface RecoveryDependencies {
  readonly fetch: typeof globalThis.fetch;
  readonly wait: (milliseconds: number) => Promise<void>;
}

const defaultDependencies: RecoveryDependencies = {
  fetch: globalThis.fetch,
  wait: (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
};

const activeRecoveries = new Map<string, Promise<void>>();
const trailingSlashPattern = /\/$/u;

const checkHostHealth = async (
  healthUrl: string,
  dependencies: RecoveryDependencies,
  attemptsRemaining: number
): Promise<void> => {
  let healthy = false;
  try {
    healthy = (await dependencies.fetch(healthUrl)).ok;
  } catch {
    // Startup commonly begins with a refused connection.
  }
  if (healthy) {
    return;
  }
  if (attemptsRemaining <= 1) {
    throw new Error(
      "The computer accepted the recovery key, and VibePad Host remains unavailable."
    );
  }
  await dependencies.wait(250);
  return checkHostHealth(healthUrl, dependencies, attemptsRemaining - 1);
};

const waitForHostHealth = async (
  hostUrl: string,
  dependencies: RecoveryDependencies
): Promise<void> => {
  const healthUrl = `${hostUrl.replace(trailingSlashPattern, "")}/health`;
  await checkHostHealth(healthUrl, dependencies, 20);
};

const wrappedNativeCausePattern =
  /Caused by:\s*[^:\n]+:\s*(?<cause>.+?)(?:\s+\(at|\n|$)/su;

const recoveryError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  const wrappedCause = message.match(wrappedNativeCausePattern)?.[1];
  return new Error(
    wrappedCause?.trim() || message || "VibePad Host startup failed."
  );
};

export const recoverSavedHost = async (
  host: HostProfile,
  nativeModule: SshRecoveryModule,
  dependencies: RecoveryDependencies = defaultDependencies
): Promise<void> => {
  const { automaticStart } = host;
  if (
    !(
      automaticStart.enabled &&
      automaticStart.recoveryKeyId &&
      automaticStart.ssh
    )
  ) {
    throw new Error("Automatic startup is unavailable for this computer.");
  }
  const { recoveryKeyId, ssh: recoverySsh } = automaticStart;
  const recoveryId = `${host.id}:${recoveryKeyId}`;
  const active = activeRecoveries.get(recoveryId);
  if (active) {
    return active;
  }
  const recovery = (async () => {
    try {
      const result = await nativeModule.recoverHostAsync({
        ...recoverySsh,
        recoveryKeyId,
      });
      if (!result.hostReady) {
        throw new Error(
          "The computer accepted the recovery key, and VibePad Host remains unavailable."
        );
      }
      await waitForHostHealth(host.url, dependencies);
    } catch (error) {
      throw recoveryError(error);
    }
  })();
  activeRecoveries.set(recoveryId, recovery);
  try {
    await recovery;
  } finally {
    activeRecoveries.delete(recoveryId);
  }
};
