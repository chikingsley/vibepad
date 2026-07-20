import { describe, expect, it } from "vitest";

import { CodexEventHub } from "./event-hub";

const emit = (hub: CodexEventHub, marker: string) =>
  hub.emit({
    kind: "provider.event",
    native: { marker },
    projectId: "codex:project:test",
    sessionId: "codex:thread:test",
  });

describe("Codex event subscriptions", () => {
  it("starts new subscriptions at the live edge and replays from an explicit cursor", async () => {
    const hub = new CodexEventHub();
    const first = emit(hub, "first");
    const liveController = new AbortController();
    const live = hub
      .subscribe("codex:thread:test", liveController.signal)
      [Symbol.asyncIterator]();
    const nextLive = live.next();
    const second = emit(hub, "second");

    await expect(nextLive).resolves.toEqual({ done: false, value: second });
    liveController.abort();
    await live.return?.();

    const replayController = new AbortController();
    const replay = hub
      .subscribe("codex:thread:test", replayController.signal, first.cursor)
      [Symbol.asyncIterator]();
    await expect(replay.next()).resolves.toEqual({
      done: false,
      value: second,
    });
    replayController.abort();
    await replay.return?.();
  });
});
