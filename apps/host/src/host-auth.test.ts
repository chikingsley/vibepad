import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, it as test } from "vitest";

const execFileAsync = promisify(execFile);
const fixturePath = fileURLToPath(
  new URL("./host-auth.fixture.ts", import.meta.url)
);

test("pairs, authenticates, revokes, and preserves loopback access through a real SQLite host", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vibepad-host-auth-"));
  try {
    const { stdout } = await execFileAsync("bun", [
      fixturePath,
      join(directory, "host-auth.sqlite"),
    ]);
    expect(JSON.parse(stdout) as unknown).toEqual({
      afterRevocation: 401,
      authenticated: 200,
      browserLoopback: 401,
      concurrentWriterWaited: true,
      hostId: "hochi",
      loopback: 200,
      metadataPersisted: true,
      paired: 201,
      pairingCodeMatches: true,
      rateLimited: 429,
      retryAfterPresent: true,
      reusedCode: 401,
      revoked: 200,
      storedTokenIsHash: true,
      unauthenticated: 401,
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
