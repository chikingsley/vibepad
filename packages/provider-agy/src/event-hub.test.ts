import type {
  ProviderEvent,
  ProviderEventStore,
} from "@vibepad/protocol/events";
import { expect, it as test } from "vitest";

import { AgyEventHub } from "./event-hub";

class RecordingStore implements ProviderEventStore {
  readonly events: ProviderEvent[] = [];

  append(event: ProviderEvent): void {
    this.events.push(event);
  }

  latestSequence(providerId: string): number {
    return this.events.reduce(
      (latest, event) =>
        event.providerId === providerId
          ? Math.max(latest, event.sequence)
          : latest,
      0
    );
  }

  list(
    providerId: string,
    sessionId: string,
    afterSequence = 0
  ): readonly ProviderEvent[] {
    return this.events.filter(
      (event) =>
        event.providerId === providerId &&
        event.sessionId === sessionId &&
        event.sequence > afterSequence
    );
  }
}

test("stamps agy provider ids and monotonic sequences", () => {
  const store = new RecordingStore();
  const hub = new AgyEventHub(store);
  const first = hub.emit({
    kind: "turn.started",
    native: {},
    projectId: "agy:project:a",
    sessionId: "agy:session:live.a",
  });
  const second = hub.emit({
    kind: "turn.completed",
    native: {},
    projectId: "agy:project:a",
    sessionId: "agy:session:live.a",
  });
  expect(first.providerId).toBe("agy");
  expect(first.eventId).toBe("agy-event:1");
  expect(second.sequence).toBe(first.sequence + 1);
  expect(store.events).toHaveLength(2);
});

test("continues the sequence from a persisted store", () => {
  const store = new RecordingStore();
  const hub = new AgyEventHub(store);
  hub.emit({
    kind: "turn.started",
    native: {},
    projectId: "agy:project:a",
    sessionId: "agy:session:live.a",
  });
  const resumed = new AgyEventHub(store);
  const next = resumed.emit({
    kind: "turn.completed",
    native: {},
    projectId: "agy:project:a",
    sessionId: "agy:session:live.a",
  });
  expect(next.sequence).toBe(2);
});

test("replays persisted events for a session after a cursor", () => {
  const store = new RecordingStore();
  const hub = new AgyEventHub(store);
  hub.emit({
    kind: "turn.started",
    native: { index: 1 },
    projectId: "agy:project:a",
    sessionId: "agy:session:live.a",
  });
  hub.emit({
    kind: "turn.completed",
    native: { index: 2 },
    projectId: "agy:project:a",
    sessionId: "agy:session:live.a",
  });
  const replayed = hub.persistedEvents("agy:session:live.a");
  expect(replayed.map((event) => event.kind)).toEqual([
    "turn.started",
    "turn.completed",
  ]);
});
