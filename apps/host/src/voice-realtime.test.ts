import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, it as test } from "vitest";

const execFileAsync = promisify(execFile);
const fixturePath = fileURLToPath(
  new URL("./voice-realtime.fixture.ts", import.meta.url)
);

test("proxies authenticated realtime PCM and terminal transcripts over two real WebSockets", async () => {
  const { stdout } = await execFileAsync("bun", [fixturePath]);
  const result = JSON.parse(stdout) as {
    audioChunks: number[][];
    authorization: string;
    clientMetadata: Record<string, string | null>;
    mintCount: number;
    mintRequest: unknown;
    terminal: {
      result: { content: { text: string } };
      type: string;
    };
    upstreamQuery: string;
  };

  expect(result.authorization).toBe("Bearer pvc_fixture-child-token");
  expect(result.audioChunks).toEqual([[1, 2, 3, 4]]);
  expect(result.clientMetadata).toEqual({
    deviceId: "507c7cc3-8247-4fab-86a7-23b666316e8f",
    deviceModel: "iPad Pro 13-inch (M4)",
    installationId: "92dc9ebf-3093-43da-84b7-242006585440",
    osVersion: "26.0",
    platform: "ios",
  });
  expect(result.mintCount).toBe(1);
  expect(result.mintRequest).toEqual({
    installation_id: "92dc9ebf-3093-43da-84b7-242006585440",
    scopes: [
      "models:read",
      "text:write",
      "transcriptions:read",
      "transcriptions:write",
    ],
    ttl_seconds: 3600,
  });
  expect(result.terminal).toMatchObject({
    result: { content: { text: "voice bridge works" } },
    type: "session.completed",
  });

  const query = new URLSearchParams(result.upstreamQuery);
  expect(Object.fromEntries(query)).toMatchObject({
    channels: "1",
    dictation: "true",
    encoding: "linear16",
    interim_results: "true",
    model: "elevenlabs-scribe_v2",
    sample_rate: "16000",
  });
});
