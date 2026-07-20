import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import { pairHostResponseSchema } from "@vibepad/protocol/auth";
import { OpenCodeAdapter } from "@vibepad/provider-opencode/adapter";
import { spawn } from "bun";

import { HostAuthService } from "./host-auth";
import { createRequestHandler } from "./http";

const [, , databasePath] = process.argv;
if (!databasePath) {
  throw new Error("host-auth fixture requires a database path");
}

const hostAuth = new HostAuthService({
  databasePath,
  hostId: "hochi",
  hostName: "Hochi",
});
const lockFixturePath = fileURLToPath(
  new URL("./host-auth-lock.fixture.ts", import.meta.url)
);
const lockHolder = spawn(["bun", lockFixturePath, databasePath], {
  stdout: "pipe",
});
const lockOutput = lockHolder.stdout.getReader();
const { value: lockReady } = await lockOutput.read();
lockOutput.releaseLock();
if (new TextDecoder().decode(lockReady).trim() !== "locked") {
  throw new Error("host-auth lock fixture did not acquire its write lock");
}
const pairingStartedAt = performance.now();
const pairing = hostAuth.createPairingCode();
const concurrentWriterWaitMs = performance.now() - pairingStartedAt;
if ((await lockHolder.exited) !== 0) {
  throw new Error("host-auth lock fixture failed");
}
const handler = createRequestHandler(
  new OpenCodeAdapter("http://127.0.0.1:1"),
  "Hochi",
  undefined,
  hostAuth
);
const remoteServer = {
  requestIP: () => ({ address: "100.64.0.42" }),
  timeout: () => undefined,
};
const loopbackServer = {
  requestIP: () => ({ address: "127.0.0.1" }),
  timeout: () => undefined,
};
const attackerServer = {
  requestIP: () => ({ address: "100.64.0.99" }),
  timeout: () => undefined,
};
const clientMetadata = {
  appId: "studio.peacockery.vibepad",
  appVersion: "1.0.0",
  clientVersion: "1.0.0",
  deviceModel: "iPad Pro 13-inch (M4)",
  installationId: "92dc9ebf-3093-43da-84b7-242006585440",
  osVersion: "26.0",
  platform: "ios",
} as const;

const unauthenticated = await handler(
  new Request("http://vibepad.test/v1/providers"),
  remoteServer
);
const pairedResponse = await handler(
  new Request("http://vibepad.test/v1/pairing/redeem", {
    body: JSON.stringify({
      clientMetadata,
      code: pairing.code,
      deviceName: "Fixture iPad",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }),
  remoteServer
);
const paired = pairHostResponseSchema.parse(await pairedResponse.json()).data;
const authorization = `Bearer ${paired.token}`;
const authenticated = await handler(
  new Request("http://vibepad.test/v1/providers", {
    headers: { Authorization: authorization },
  }),
  remoteServer
);
const reusedCode = await handler(
  new Request("http://vibepad.test/v1/pairing/redeem", {
    body: JSON.stringify({
      clientMetadata: {
        ...clientMetadata,
        installationId: "453fd3a2-8ad6-4c51-bf16-0c3e08a4f95a",
      },
      code: pairing.code,
      deviceName: "Second fixture device",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }),
  remoteServer
);
const revoked = await handler(
  new Request("http://vibepad.test/v1/auth/device", {
    headers: { Authorization: authorization },
    method: "DELETE",
  }),
  remoteServer
);
const afterRevocation = await handler(
  new Request("http://vibepad.test/v1/providers", {
    headers: { Authorization: authorization },
  }),
  remoteServer
);
const loopback = await handler(
  new Request("http://vibepad.test/v1/providers"),
  loopbackServer
);
const browserLoopback = await handler(
  new Request("http://vibepad.test/v1/providers", {
    headers: { Origin: "http://malicious.example" },
  }),
  loopbackServer
);
let rateLimitedStatus = 0;
let retryAfterPresent = false;
for (let attempt = 0; attempt < 6; attempt += 1) {
  // biome-ignore lint/performance/noAwaitInLoops: attempts must reach the limiter in order.
  const response = await handler(
    new Request("http://vibepad.test/v1/pairing/redeem", {
      body: JSON.stringify({
        clientMetadata: {
          ...clientMetadata,
          installationId: "065a2d61-e8ad-48e3-8f3c-8c6d1c97c315",
        },
        code: pairing.code === "AAAA-AAAA" ? "BBBB-BBBB" : "AAAA-AAAA",
        deviceName: "Attacker fixture",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    attackerServer
  );
  rateLimitedStatus = response.status;
  retryAfterPresent = Number(response.headers.get("retry-after")) > 0;
}

hostAuth.close();
const database = new Database(databasePath, { readonly: true, strict: true });
const stored = database
  .query<
    {
      readonly device_model: string;
      readonly installation_id: string;
      readonly token_hash: string;
    },
    [string]
  >(`
    SELECT
      paired_devices.token_hash,
      paired_device_metadata.device_model,
      paired_device_metadata.installation_id
    FROM paired_devices
    INNER JOIN paired_device_metadata
      ON paired_device_metadata.device_id = paired_devices.device_id
    WHERE paired_devices.device_id = ?
  `)
  .get(paired.deviceId);
database.close(true);

console.log(
  JSON.stringify({
    afterRevocation: afterRevocation.status,
    authenticated: authenticated.status,
    browserLoopback: browserLoopback.status,
    concurrentWriterWaited: concurrentWriterWaitMs >= 100,
    hostId: paired.hostId,
    loopback: loopback.status,
    metadataPersisted:
      stored?.installation_id === clientMetadata.installationId &&
      stored.device_model === clientMetadata.deviceModel,
    paired: pairedResponse.status,
    pairingCodeMatches: /^[A-Z2-9]{4}-[A-Z2-9]{4}$/u.test(pairing.code),
    rateLimited: rateLimitedStatus,
    retryAfterPresent,
    reusedCode: reusedCode.status,
    revoked: revoked.status,
    storedTokenIsHash:
      Boolean(stored?.token_hash) && stored?.token_hash !== paired.token,
    unauthenticated: unauthenticated.status,
  })
);
