import type { ProviderEvent } from "@vibepad/protocol/events";

import { SqliteProviderEventStore } from "./provider-event-store";

const [, , action, path] = process.argv;
if (!(action && path)) {
  throw new Error("Usage: provider-event-store.fixture.ts <write|read> <path>");
}

const event = (sequence: number): ProviderEvent => ({
  cursor: String(sequence),
  eventId: `codex-event:${sequence}`,
  kind: "timeline.item.upserted",
  native: {
    method: "item/completed",
    params: { item: { id: `item-${sequence}` } },
  },
  projectId: "codex-project:test",
  providerId: "codex",
  sequence,
  sessionId: "codex:test-thread",
  timestamp: new Date(sequence * 1000).toISOString(),
});

const store = new SqliteProviderEventStore(path);
try {
  if (action === "write") {
    store.append(event(1));
    store.append(event(2));
  } else if (action === "read") {
    console.log(
      JSON.stringify({
        events: store.list("codex", "codex:test-thread", 1),
        latestSequence: store.latestSequence("codex"),
      })
    );
  } else {
    throw new Error(`Unknown fixture action: ${action}`);
  }
} finally {
  store.close();
}
