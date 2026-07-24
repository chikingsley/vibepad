import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ReadySessionControls,
  SessionControlStore,
} from "@vibepad/protocol/provider";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClaudeCodeAdapter } from "./adapter";
import { detectClaudeCode } from "./detect";
import { claudeCodeNativeSessionId, claudeCodeProjectId } from "./ids";

/**
 * Live integration suite: drives the real Claude Agent SDK, which spawns a
 * real Claude Code runtime and makes billed Anthropic calls. It is therefore
 * OPT-IN ONLY and skipped by default; run it explicitly with
 *
 *   VIBEPAD_LIVE_CLAUDE_CODE_TESTS=1 bun run --filter @vibepad/provider-claude-code test
 *
 * The suite is budgeted for exactly two tiny turns on the cheapest model
 * (claude-haiku-4-5-20251001): one plain reply and one denied Bash
 * permission ask. Auth comes from the machine's existing Claude Code login.
 */

const enabled =
  Reflect.get(process.env, "VIBEPAD_LIVE_CLAUDE_CODE_TESTS") === "1" &&
  detectClaudeCode().available;

const liveModel = "claude-haiku-4-5-20251001";
const liveTimeoutMs = 240_000;

class MemoryControlStore implements SessionControlStore {
  readonly #controls = new Map<string, ReadySessionControls>();

  delete(providerId: string, sessionId: string): void {
    this.#controls.delete(`${providerId}:${sessionId}`);
  }

  read(
    providerId: string,
    sessionId: string
  ): ReadySessionControls | undefined {
    return this.#controls.get(`${providerId}:${sessionId}`);
  }

  write(
    providerId: string,
    sessionId: string,
    controls: ReadySessionControls
  ): void {
    this.#controls.set(`${providerId}:${sessionId}`, controls);
  }
}

describe.skipIf(!enabled)("live Claude Code adapter", () => {
  let adapter: ClaudeCodeAdapter;
  let projectDirectory = "";
  let projectId = "";

  beforeAll(async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), "vibepad-claude-live-"));
    await writeFile(
      join(projectDirectory, "README.md"),
      "# VibePad live fixture\n"
    );
    projectId = claudeCodeProjectId(projectDirectory);
    adapter = new ClaudeCodeAdapter({
      projectRoots: [projectDirectory],
      sessionControlStore: new MemoryControlStore(),
      // Hermetic: exclude this machine's user/project/local settings so
      // local allow rules, default modes, and hooks cannot change the
      // permission behavior under test. Auth is unaffected.
      settingSources: [],
    });
  });

  afterAll(async () => {
    await adapter.dispose();
    if (projectDirectory) {
      await rm(projectDirectory, { force: true, recursive: true });
    }
  });

  it("runs one tiny turn end to end and lands a resumable session on disk", {
    timeout: liveTimeoutMs,
  }, async () => {
    const health = await adapter.health();
    expect(health.healthy).toBe(true);

    const created = await adapter.createSession({ projectId });
    const nativeId = claudeCodeNativeSessionId(created.id);
    await adapter.selectModel({
      id: liveModel,
      providerId: "anthropic",
      sessionId: created.id,
    });

    const controller = new AbortController();
    const kinds: string[] = [];
    const completed = (async () => {
      for await (const event of adapter.subscribe(
        created.id,
        controller.signal
      )) {
        kinds.push(event.kind);
        if (event.kind === "turn.completed") {
          controller.abort();
        }
      }
    })();

    await adapter.sendTurn({
      sessionId: created.id,
      text: "Reply with exactly: ok",
    });
    await completed;

    expect(kinds).toContain("turn.started");
    expect(kinds).toContain("timeline.item.upserted");
    expect(kinds.at(-1)).toBe("turn.completed");

    const timeline = await adapter.listTimeline(created.id);
    const userItem = timeline.items.find((item) => item.role === "user");
    expect(userItem?.parts[0]).toMatchObject({
      text: "Reply with exactly: ok",
      type: "text",
    });
    // Claude emits thinking and final text as SEPARATE assistant messages
    // (one timeline item each), so the reply text must be searched across
    // every assistant item, not just the first.
    const assistantTexts = timeline.items
      .filter((item) => item.role === "assistant")
      .flatMap((item) => item.parts)
      .flatMap((part) => (part.type === "text" ? [part.text] : []));
    expect(
      assistantTexts.some((text) => text.toLowerCase().includes("ok"))
    ).toBe(true);
    // Exactly one user item: the synthetic send-time entry must have been
    // replaced by its transcript twin, not duplicated alongside it.
    expect(timeline.items.filter((item) => item.role === "user")).toHaveLength(
      1
    );
    for (const item of timeline.items) {
      expect(item.native).toBeDefined();
      expect(item.sessionId).toBe(created.id);
    }

    // The session id we pre-assigned is the resumable identity on disk.
    const sessions = await adapter.listSessions(projectId);
    expect(
      sessions.some(
        (session) => claudeCodeNativeSessionId(session.id) === nativeId
      )
    ).toBe(true);
  });

  it("surfaces a live Bash permission ask and honors a rejection", {
    timeout: liveTimeoutMs,
  }, async () => {
    const created = await adapter.createSession({ projectId });
    await adapter.selectModel({
      id: liveModel,
      providerId: "anthropic",
      sessionId: created.id,
    });

    const controller = new AbortController();
    const kinds: string[] = [];
    const completed = (async () => {
      for await (const event of adapter.subscribe(
        created.id,
        controller.signal
      )) {
        kinds.push(event.kind);
        if (event.kind === "permission.requested") {
          const [interaction] = await adapter.listInteractions(created.id);
          if (interaction) {
            await adapter.respondPermission({
              decision: "reject",
              message: "Denied by the VibePad live test.",
              requestId: interaction.id,
              sessionId: created.id,
            });
          }
        }
        if (event.kind === "turn.completed") {
          controller.abort();
        }
      }
    })();

    // IMPORTANT: the command must actually WRITE. Claude Code's built-in
    // safe-command classification auto-approves read-only commands like
    // `echo` in default mode without ever consulting canUseTool, so only a
    // stateful command proves the permission gate engages.
    await adapter.sendTurn({
      sessionId: created.id,
      text: "Use the Bash tool to run exactly `touch vibepad-live.txt`, nothing else. If the tool is denied, stop immediately and do not retry or work around it.",
    });
    await completed;

    expect(kinds).toContain("permission.requested");
    expect(kinds).toContain("permission.resolved");
    expect(kinds.at(-1)).toBe("turn.completed");
    await expect(adapter.listInteractions(created.id)).resolves.toHaveLength(0);
    // The rejection must have prevented the write.
    expect(existsSync(join(projectDirectory, "vibepad-live.txt"))).toBe(false);
  });
});
