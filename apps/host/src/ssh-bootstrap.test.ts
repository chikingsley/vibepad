import { pairingInvitationUrl } from "@vibepad/protocol/auth";
import { expect, it } from "vitest";
import type { CommandRunner } from "./service-discovery";
import { OpenSshBootstrap } from "./ssh-bootstrap";

const invitation = {
  code: "ABCD-2345",
  endpoints: ["http://100.64.0.4:4100"],
  expiresAt: "2026-07-22T01:00:00.000Z",
  hostId: "gmk-host",
  hostName: "gmk",
  version: 1 as const,
};

it("bootstraps a discovered SSH target and returns its pairing invitation", async () => {
  const commands: Array<readonly [string, readonly string[]]> = [];
  const runner: CommandRunner = (executable, args) => {
    commands.push([executable, args]);
    return Promise.resolve({
      exitCode: 0,
      stderr: "",
      stdout: `VibePad Host is ready.\nInvitation: ${pairingInvitationUrl(invitation)}\n`,
    });
  };
  const bootstrap = new OpenSshBootstrap({
    runner,
    targets: {
      listTargets: () =>
        Promise.resolve([
          {
            alias: "gmk",
            hostName: "gmk.tailnet.example",
            port: 22,
            source: "ssh-config" as const,
            user: "simon",
          },
        ]),
    },
  });

  await expect(bootstrap.installAndStart("gmk")).resolves.toEqual(invitation);
  expect(commands[0]?.[0]).toBe("ssh");
  expect(commands[0]?.[1]).toContain("gmk");
  expect(commands[0]?.[1]).toContain(
    "curl -fsSL https://vibepad.peacockery.studio/downloads/host/install.sh | bash -s -- --yes --allow-unauthenticated"
  );
});

it("rejects aliases outside the discovered controller targets", async () => {
  const bootstrap = new OpenSshBootstrap({
    runner: () => Promise.reject(new Error("SSH should stay idle")),
    targets: { listTargets: () => Promise.resolve([]) },
  });

  await expect(bootstrap.installAndStart("missing")).rejects.toThrow(
    "SSH target missing is unavailable"
  );
});
