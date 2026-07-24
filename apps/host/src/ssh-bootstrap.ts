import type { PairingInvitation } from "@vibepad/protocol/auth";
import { decodePairingInvitationUrl } from "@vibepad/protocol/auth";

import { type CommandRunner, runCommand } from "./service-discovery";
import type { SshTargetDiscovery } from "./ssh-target-discovery";

const installer =
  "curl -fsSL https://vibepad.peacockery.studio/downloads/host/install.sh | bash -s -- --yes --allow-unauthenticated";
const invitationLine = /^Invitation:\s+(vibepad:\/\/pair\?\S+)$/mu;

export interface SshBootstrap {
  readonly installAndStart: (alias: string) => Promise<PairingInvitation>;
}

export class OpenSshBootstrap implements SshBootstrap {
  readonly #runner: CommandRunner;
  readonly #targets: SshTargetDiscovery;

  constructor(options: {
    readonly runner?: CommandRunner;
    readonly targets: SshTargetDiscovery;
  }) {
    this.#runner = options.runner ?? runCommand;
    this.#targets = options.targets;
  }

  async installAndStart(alias: string): Promise<PairingInvitation> {
    const target = (await this.#targets.listTargets()).find(
      (candidate) => candidate.alias === alias
    );
    if (!target) {
      throw new Error(`SSH target ${alias} is unavailable`);
    }
    const result = await this.#runner("ssh", [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      target.alias,
      installer,
    ]);
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim();
      throw new Error(
        `SSH bootstrap on ${target.alias} exited ${result.exitCode}${detail ? `: ${detail}` : ""}`
      );
    }
    const invitationUrl = invitationLine.exec(result.stdout)?.[1];
    const invitation = invitationUrl
      ? decodePairingInvitationUrl(invitationUrl)
      : undefined;
    if (!invitation) {
      throw new Error(
        `VibePad Host started on ${target.alias} without returning a pairing invitation`
      );
    }
    return invitation;
  }
}
