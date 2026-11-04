import { fileURLToPath } from "node:url";

import { expect, it as test } from "vitest";

import {
  CodexAppServerClient,
  CodexAppServerConnectionError,
  CodexNotInstalledError,
} from "./app-server-client";

const initializeErrorFixturePath = fileURLToPath(
  new URL("../scripts/app-server-initialize-error-fixture.ts", import.meta.url)
);

const reportedVersionPattern = /installed Codex CLI reports "\d+\.\d+/u;

test("classifies a missing Codex binary as an actionable install error", async () => {
  const client = new CodexAppServerClient({
    command: ["/nonexistent/vibepad-codex-binary"],
    requestTimeoutMs: 5000,
  });
  try {
    const failure = await client.start().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CodexNotInstalledError);
    expect(failure).toBeInstanceOf(CodexAppServerConnectionError);
    expect((failure as Error).message).toContain("Codex CLI is not installed");
    expect((failure as Error).message).toContain(
      "/nonexistent/vibepad-codex-binary"
    );
    expect((failure as Error).message).toContain(
      "npm install -g @openai/codex"
    );
  } finally {
    await client.dispose();
  }
});

test("classifies a failed initialize handshake as a version-shaped error", async () => {
  const client = new CodexAppServerClient({
    command: ["bun", initializeErrorFixturePath],
    requestTimeoutMs: 5000,
  });
  try {
    const failure = await client.start().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CodexAppServerConnectionError);
    expect(failure).not.toBeInstanceOf(CodexNotInstalledError);
    const { message } = failure as Error;
    expect(message).toContain("Codex app-server initialize failed");
    expect(message).toContain("Unrecognized method initialize");
    expect(message).toContain("requires Codex CLI 0.130 or newer");
    // The probe ran the injected executable ("bun") once, so the error
    // carries the version the binary actually reported.
    expect(message).toMatch(reportedVersionPattern);
  } finally {
    await client.dispose();
  }
});
