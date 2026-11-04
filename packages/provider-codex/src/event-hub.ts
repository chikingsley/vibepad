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

  latestSequence(providerId: string): number {
    return providerId === "codex" ? this.#latestSequence : 0;
  }

  list(
    providerId: string,
    sessionId: string,
    afterSequence = 0
  ): readonly ProviderEvent[] {
    return this.#events.filter(
      (event) =>
        event.providerId === providerId &&
        event.sessionId === sessionId &&
        event.sequence > afterSequence
    );
  }
}

export class CodexEventHub {
  readonly #listeners = new Map<string, Set<EventListener>>();
  readonly #store: ProviderEventStore;
  #sequence: number;

  constructor(store: ProviderEventStore = new MemoryProviderEventStore()) {
    this.#store = store;
    this.#sequence = store.latestSequence("codex");
  }

  emit(input: EventInput): ProviderEvent {
    this.#sequence += 1;
    const cursor = String(this.#sequence);
    const event: ProviderEvent = {
      cursor,
      eventId: `codex-event:${cursor}`,
      kind: input.kind,
      native: input.native,
      projectId: input.projectId,
      providerId: "codex",
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
    const queue = [...this.#store.list("codex", sessionId, after)];
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

    const nextEvent = () =>
      new Promise<void>((resolve) => {
        wake = resolve;
      });

    try {
      while (!signal?.aborted) {
        const event = queue.shift();
        if (event) {
          yield event;
          continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: Each subscriber must wait for its next sequential event.
        await nextEvent();
      }
    } finally {
      signal?.removeEventListener("abort", abort);
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.#listeners.delete(sessionId);
      }
    }
  }

  persistedEvents(sessionId: string): readonly ProviderEvent[] {
    return this.#store.list("codex", sessionId);
  }
}
