import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, expect, it as test } from "vitest";

const execFileAsync = promisify(execFile);
const fixturePath = fileURLToPath(
  new URL("./provider-event-store.fixture.ts", import.meta.url)
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

test("reopens durable provider events in another Bun process", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vibepad-provider-events-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "events.sqlite");

  await execFileAsync("bun", [fixturePath, "write", path]);
  const { stdout } = await execFileAsync("bun", [fixturePath, "read", path]);

  expect(JSON.parse(stdout) as unknown).toEqual({
    events: [
      {
        cursor: "2",
        eventId: "codex-event:2",
        kind: "timeline.item.upserted",
        native: {
          method: "item/completed",
          params: { item: { id: "item-2" } },
        },
        projectId: "codex-project:test",
        providerId: "codex",
        sequence: 2,
        sessionId: "codex:test-thread",
        timestamp: "1970-01-01T00:00:02.000Z",
      },
    ],
    latestSequence: 2,
  });
});
