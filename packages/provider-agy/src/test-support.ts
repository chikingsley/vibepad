/**
 * Shared fixtures for the provider-agy test suite: an in-memory event store,
 * plus scripted fake `agy --print` processes mirroring the fake-child pattern
 * Happy uses to test its agy backend
 * (happy-cli/src/agy/AgyBackend.test.ts:8-22).
 */

import type {
  ProviderEvent,
  ProviderEventStore,
} from "@vibepad/protocol/events";
import type { AgyChildProcess, AgySpawnFn, AgyStreamEmitter } from "./adapter";

export class RecordingEventStore implements ProviderEventStore {
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

export class FakeStream implements AgyStreamEmitter {
  readonly #listeners: ((chunk: string) => void)[] = [];

  emit(chunk: string): void {
    for (const listener of this.#listeners) {
      listener(chunk);
    }
  }

  on(_event: "data", listener: (chunk: string) => void): unknown {
    this.#listeners.push(listener);
    return this;
  }

  setEncoding(_encoding: string): unknown {
    return this;
  }
}

export class SpawnFailure extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export class FakeChild implements AgyChildProcess {
  readonly kills: (NodeJS.Signals | undefined)[] = [];
  readonly stderr = new FakeStream();
  readonly stdout = new FakeStream();
  readonly #closeListeners: ((code: number | null) => void)[] = [];
  readonly #errorListeners: ((error: Error) => void)[] = [];

  close(code: number | null): void {
    for (const listener of this.#closeListeners) {
      listener(code);
    }
  }

  error(failure: Error): void {
    for (const listener of this.#errorListeners) {
      listener(failure);
    }
  }

  kill(signal?: NodeJS.Signals): boolean {
    this.kills.push(signal);
    return true;
  }

  on(event: "close", listener: (code: number | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close" | "error", listener: unknown): unknown {
    if (event === "close") {
      this.#closeListeners.push(listener as (code: number | null) => void);
    } else {
      this.#errorListeners.push(listener as (error: Error) => void);
    }
    return this;
  }
}

export interface SpawnCall {
  readonly args: readonly string[];
  readonly command: string;
  readonly cwd: string;
}

export const makeSpawnScript = () => {
  const calls: SpawnCall[] = [];
  const children: FakeChild[] = [];
  const spawnFn: AgySpawnFn = (command, args, options) => {
    const child = new FakeChild();
    calls.push({ args, command, cwd: options.cwd });
    children.push(child);
    return child;
  };
  return { calls, children, spawnFn };
};

export const single = <Value>(items: readonly Value[]): Value => {
  const [first] = items;
  if (first === undefined || items.length !== 1) {
    throw new Error(`Expected exactly one item, got ${items.length}`);
  }
  return first;
};
