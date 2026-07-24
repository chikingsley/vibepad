import type {
  ProviderEvent,
  ProviderEventKind,
  ProviderEventStore,
} from "@vibepad/protocol/events";

type EventInput = Readonly<{
  kind: ProviderEventKind;
  native: unknown;
  projectId: string;
  sessionId: string;
}>;

type EventListener = (event: ProviderEvent) => void;

const providerId = "claude-code";

class MemoryProviderEventStore implements ProviderEventStore {
  readonly #events: ProviderEvent[] = [];
  #latestSequence = 0;

  append(event: ProviderEvent): void {
    this.#events.push(event);
    this.#latestSequence = Math.max(this.#latestSequence, event.sequence);
    if (this.#events.length > 2000) {
      this.#events.splice(0, this.#events.length - 2000);
    }
  }

  latestSequence(id: string): number {
    return id === providerId ? this.#latestSequence : 0;
  }

  list(
    id: string,
    sessionId: string,
    afterSequence = 0
  ): readonly ProviderEvent[] {
    return this.#events.filter(
      (event) =>
        event.providerId === id &&
        event.sessionId === sessionId &&
        event.sequence > afterSequence
    );
  }
}

export class ClaudeCodeEventHub {
  readonly #listeners = new Map<string, Set<EventListener>>();
  #sequence: number;
  readonly #store: ProviderEventStore;

  constructor(store: ProviderEventStore = new MemoryProviderEventStore()) {
    this.#store = store;
    this.#sequence = store.latestSequence(providerId);
  }

  emit(input: EventInput): ProviderEvent {
    this.#sequence += 1;
    const cursor = String(this.#sequence);
    const event: ProviderEvent = {
      cursor,
      eventId: `claude-code-event:${cursor}`,
      kind: input.kind,
      native: input.native,
      projectId: input.projectId,
      providerId,
      sequence: this.#sequence,
      sessionId: input.sessionId,
      timestamp: new Date().toISOString(),
    };
    this.#store.append(event);
    for (const listener of this.#listeners.get(input.sessionId) ?? []) {
      listener(event);
    }
    return event;
  }

  async *subscribe(
    sessionId: string,
    signal?: AbortSignal,
    afterCursor?: string
  ): AsyncIterable<ProviderEvent> {
    const after = afterCursor ? Number(afterCursor) : this.#sequence;
    const queue = [...this.#store.list(providerId, sessionId, after)];
    let wake: (() => void) | undefined;
    const listener = (event: ProviderEvent) => {
      queue.push(event);
      wake?.();
      wake = undefined;
    };
    const abort = () => {
      wake?.();
      wake = undefined;
    };
    const listeners =
      this.#listeners.get(sessionId) ?? new Set<EventListener>();
    listeners.add(listener);
    this.#listeners.set(sessionId, listeners);
    signal?.addEventListener("abort", abort, { once: true });

    try {
      while (!signal?.aborted) {
        const event = queue.shift();
        if (event) {
          yield event;
          continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: Each subscriber must wait for its next sequential event.
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      signal?.removeEventListener("abort", abort);
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.#listeners.delete(sessionId);
      }
    }
  }
}
