import { createInterface } from "node:readline";

// Simulates an outdated Codex binary that still speaks JSON-RPC over stdio
// but rejects the v2 `initialize` handshake.
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line) as Record<string, unknown>;
  if (message.method === "initialize") {
    process.stdout.write(
      `${JSON.stringify({
        error: { code: -32_601, message: "Unrecognized method initialize" },
        id: message.id,
      })}\n`
    );
  }
});
