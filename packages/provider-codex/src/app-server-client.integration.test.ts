import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import type { GetAccountResponse } from "../generated/v2/GetAccountResponse";
import {
  CodexAppServerClient,
  CodexAppServerConnectionError,
} from "./app-server-client";

interface FixtureState {
  readonly connections: number;
  readonly readRequests: number;
  readonly turnStartRequests: number;
}

const fixturePath = fileURLToPath(
  new URL("../scripts/app-server-lifecycle-fixture.ts", import.meta.url)
);

it.each(["exit", "malformed"] as const)(
  "replays safe reads once after a %s wire failure without replaying mutations",
  async (failureMode) => {
    const directory = await mkdtemp(
      join(tmpdir(), "vibepad-codex-client-lifecycle-")
    );
    const statePath = join(directory, "state.json");
    const client = new CodexAppServerClient({
      command: ["bun", fixturePath, statePath, failureMode],
      requestTimeoutMs: 5000,
    });
    const connectionStates: string[] = [];
    const unsubscribe = client.onConnectionState((state) => {
      connectionStates.push(`${state.kind}:${state.generation}`);
    });

    try {
      const account = await client.request<GetAccountResponse>(
        "account/read",
        {},
        { retryOnDisconnect: true }
      );
      expect(account).toEqual({ account: null, requiresOpenaiAuth: false });

      await expect(client.request("turn/start", {})).rejects.toBeInstanceOf(
        CodexAppServerConnectionError
      );

      const state = JSON.parse(
        await readFile(statePath, "utf8")
      ) as FixtureState;
      expect(state).toEqual({
        connections: 2,
        readRequests: 2,
        turnStartRequests: 1,
      });
      expect(connectionStates).toEqual([
        "connected:1",
        "disconnected:1",
        "connected:2",
        "disconnected:2",
      ]);
    } finally {
      unsubscribe();
      await client.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  }
);
