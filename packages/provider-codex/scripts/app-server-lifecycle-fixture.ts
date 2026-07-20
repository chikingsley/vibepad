import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

interface FixtureState {
  readonly connections: number;
  readonly readRequests: number;
  readonly turnStartRequests: number;
}

const [, , statePath, failureMode] = process.argv;
if (!(statePath && (failureMode === "exit" || failureMode === "malformed"))) {
  throw new Error(
    "Usage: app-server-lifecycle-fixture.ts STATE_PATH exit|malformed"
  );
}

const loadState = (): FixtureState =>
  existsSync(statePath)
    ? (JSON.parse(readFileSync(statePath, "utf8")) as FixtureState)
    : { connections: 0, readRequests: 0, turnStartRequests: 0 };

let state = loadState();
state = { ...state, connections: state.connections + 1 };
writeFileSync(statePath, JSON.stringify(state));

const respond = (id: unknown, result: unknown) => {
  process.stdout.write(`${JSON.stringify({ id, result })}\n`);
};

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line) as Record<string, unknown>;
  const { method } = message;
  if (method === "initialize") {
    respond(message.id, {
      codexHome: "/tmp/vibepad-codex-fixture",
      platformFamily: "unix",
      platformOs: "linux",
      userAgent: "vibepad-codex-lifecycle-fixture",
    });
    return;
  }
  if (method === "initialized") {
    return;
  }
  if (method === "account/read") {
    state = { ...state, readRequests: state.readRequests + 1 };
    writeFileSync(statePath, JSON.stringify(state));
    if (state.readRequests === 1) {
      if (failureMode === "malformed") {
        process.stdout.write("{malformed-json\n");
        return;
      }
      process.exit(0);
    }
    respond(message.id, { account: null, requiresOpenaiAuth: false });
    return;
  }
  if (method === "turn/start") {
    state = {
      ...state,
      turnStartRequests: state.turnStartRequests + 1,
    };
    writeFileSync(statePath, JSON.stringify(state));
    process.exit(0);
  }
  process.stdout.write(
    `${JSON.stringify({
      error: { code: -32_601, message: `Unsupported ${String(method)}` },
      id: message.id,
    })}\n`
  );
});
