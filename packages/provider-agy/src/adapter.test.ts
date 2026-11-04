import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it as test } from "vitest";

import { AgyAdapter } from "./adapter";
import { AGY_MODELS } from "./constants";
import { agyLiveSessionKey, agyProjectId, agySessionId } from "./ids";
import {
  makeSpawnScript,
  RecordingEventStore,
  SpawnFailure,
  single,
} from "./test-support";

let workspace: string;
let cachePath: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "agy-adapter-"));
  cachePath = join(workspace, "last_conversations.json");
});

afterEach(async () => {
  await rm(workspace, { force: true, recursive: true });
});

const executable = "/opt/fake/agy";

const makeAdapter = (
  overrides: Partial<ConstructorParameters<typeof AgyAdapter>[0]> = {}
) => {
  const script = makeSpawnScript();
  const store = new RecordingEventStore();
  const adapter = new AgyAdapter({
    cachePath,
    eventStore: store,
    executable,
    projectRoots: [workspace],
    spawnFn: script.spawnFn,
    ...overrides,
  });
  return { adapter, projectId: agyProjectId(workspace), script, store };
};

const writeCache = (cache: Record<string, string>) =>
  writeFile(cachePath, JSON.stringify(cache));

test("streams a turn: spawn args, deltas, completion, and timeline projection", async () => {
  const { adapter, projectId, script, store } = makeAdapter();
  const session = await adapter.createSession({ projectId });
  expect(session.controls).toMatchObject({ agent: "sandbox", status: "ready" });

  await adapter.sendTurn({ sessionId: session.id, text: "What is 2+2?" });
  const call = single(script.calls);
  expect(call.command).toBe(executable);
  expect(call.cwd).toBe(workspace);
  expect(call.args.at(-1)).toBe("What is 2+2?");
  expect(call.args).toContain("--print");
  expect(call.args).toContain("--sandbox");
  expect(call.args).toContain("--add-dir");
  expect(call.args).toContain("--print-timeout");
  expect(call.args).not.toContain("--conversation");

  const child = single(script.children);
  child.stdout.emit("2+2 ");
  child.stdout.emit("= 4");
  child.close(0);

  const timeline = await adapter.listTimeline(session.id);
  expect(timeline.items).toHaveLength(2);
  expect(timeline.items[0]).toMatchObject({ kind: "message", role: "user" });
  expect(timeline.items[0]?.parts[0]).toMatchObject({ text: "What is 2+2?" });
  expect(timeline.items[1]?.parts[0]).toMatchObject({
    format: "markdown",
    text: "2+2 = 4",
  });

  const summary = single(await adapter.listSessions(projectId));
  expect(summary).toMatchObject({ activity: "idle", title: "What is 2+2?" });

  expect(store.events.map((event) => event.kind)).toEqual([
    "session.updated",
    "turn.started",
    "timeline.item.upserted",
    "timeline.item.upserted",
    "turn.completed",
  ]);
});

test("marks the turn failed on non-zero exit and surfaces stderr detail", async () => {
  const { adapter, projectId, script } = makeAdapter();
  const session = await adapter.createSession({ projectId });
  await adapter.sendTurn({ sessionId: session.id, text: "explode" });
  const child = single(script.children);
  child.stderr.emit("quota exceeded");
  child.close(1);

  const timeline = await adapter.listTimeline(session.id);
  const notice = timeline.items.at(-1);
  expect(notice).toMatchObject({ kind: "notice" });
  expect(notice?.parts[0]).toMatchObject({
    text: "agy exited with code 1: quota exceeded",
  });
  expect(single(await adapter.listSessions(projectId)).activity).toBe("idle");
});

test("reports a missing binary once even when error is followed by close", async () => {
  const { adapter, projectId, script, store } = makeAdapter();
  const session = await adapter.createSession({ projectId });
  await adapter.sendTurn({ sessionId: session.id, text: "hi" });
  const child = single(script.children);
  child.error(new SpawnFailure("spawn agy ENOENT", "ENOENT"));
  child.close(null);

  const completions = store.events.filter(
    (event) => event.kind === "turn.completed"
  );
  expect(completions).toHaveLength(1);
  const timeline = await adapter.listTimeline(session.id);
  expect(timeline.items.at(-1)?.parts[0]).toMatchObject({
    text: expect.stringContaining("VIBEPAD_AGY_BIN"),
  });
});

test("pins the conversation created by the first turn and resumes it", async () => {
  const { adapter, projectId, script, store } = makeAdapter();
  const session = await adapter.createSession({ projectId });

  await adapter.sendTurn({ sessionId: session.id, text: "first" });
  await writeCache({ [workspace]: "cid-1" });
  script.children[0]?.close(0);

  await adapter.sendTurn({ sessionId: session.id, text: "second" });
  const [, resume] = script.calls;
  const index = resume?.args.indexOf("--conversation") ?? -1;
  expect(index).toBeGreaterThanOrEqual(0);
  expect(resume?.args[index + 1]).toBe("cid-1");
  expect(
    store.events.some(
      (event) =>
        event.kind === "session.updated" &&
        typeof event.native === "object" &&
        event.native !== null &&
        Reflect.get(event.native, "conversationId") === "cid-1"
    )
  ).toBe(true);
  script.children[1]?.close(0);
});

test("does not adopt a pre-existing conversation left by another session", async () => {
  await writeCache({ [workspace]: "other-sessions-conversation" });
  const { adapter, projectId, script } = makeAdapter();
  const session = await adapter.createSession({ projectId });

  await adapter.sendTurn({ sessionId: session.id, text: "first" });
  script.children[0]?.close(0);
  await adapter.sendTurn({ sessionId: session.id, text: "second" });
  script.children[1]?.close(0);

  for (const call of script.calls) {
    expect(call.args).not.toContain("--conversation");
  }
});

test("abortTurn kills the running child and rejects without one", async () => {
  const { adapter, projectId, script } = makeAdapter();
  const session = await adapter.createSession({ projectId });
  await adapter.sendTurn({ sessionId: session.id, text: "long task" });
  await adapter.abortTurn(session.id);
  const child = single(script.children);
  expect(child.kills).toContain("SIGTERM");
  child.close(null);

  const timeline = await adapter.listTimeline(session.id);
  expect(timeline.items.at(-1)).toMatchObject({ kind: "notice" });
  await expect(adapter.abortTurn(session.id)).rejects.toThrow("no active turn");
});

test("rejects a second sendTurn while a turn is running", async () => {
  const { adapter, projectId, script } = makeAdapter();
  const session = await adapter.createSession({ projectId });
  await adapter.sendTurn({ sessionId: session.id, text: "one" });
  await expect(
    adapter.sendTurn({ sessionId: session.id, text: "two" })
  ).rejects.toThrow("already has a running turn");
  script.children[0]?.close(0);
});

test("lists the workspace's last agy conversation and resumes it on demand", async () => {
  await writeCache({ [workspace]: "cid-cached-9" });
  const { adapter, script } = makeAdapter();

  const inventory = single(await adapter.listSessions());
  expect(inventory.controls.status).toBe("inventory");
  expect(inventory.title).toContain("Antigravity conversation");

  const bootstrap = await adapter.bootstrapSession(inventory.id);
  expect(bootstrap.session.controls.status).toBe("ready");
  expect(bootstrap.timeline.items).toEqual([]);

  await adapter.sendTurn({ sessionId: inventory.id, text: "continue" });
  const call = single(script.calls);
  const index = call.args.indexOf("--conversation");
  expect(call.args[index + 1]).toBe("cid-cached-9");
  script.children[0]?.close(0);

  const relisted = await adapter.listSessions();
  expect(relisted).toHaveLength(1);
});

test("restores recorded turns and titles from the event store after a restart", async () => {
  await writeCache({ [workspace]: "cid-persist" });
  const store = new RecordingEventStore();
  const first = makeAdapter({ eventStore: store });
  const session = single(await first.adapter.listSessions());
  await first.adapter.renameSession({
    sessionId: session.id,
    title: "Persistent work",
  });
  await first.adapter.sendTurn({ sessionId: session.id, text: "sum 1..10" });
  const child = single(first.script.children);
  child.stdout.emit("55");
  child.close(0);

  const second = makeAdapter({ eventStore: store });
  const restored = await second.adapter.bootstrapSession(session.id);
  expect(restored.session.title).toBe("Persistent work");
  expect(restored.timeline.items).toHaveLength(2);
  expect(restored.timeline.items[1]?.parts[0]).toMatchObject({ text: "55" });
});

test("selectModel validates against the recorded agy model list", async () => {
  const { adapter, projectId, script } = makeAdapter();
  const session = await adapter.createSession({ projectId });
  const updated = await adapter.selectModel({
    id: "Claude Opus 4.6 (Thinking)",
    providerId: "antigravity",
    sessionId: session.id,
  });
  expect(updated.controls).toMatchObject({
    model: { id: "Claude Opus 4.6 (Thinking)" },
  });
  await expect(
    adapter.selectModel({
      id: "gpt-5-codex",
      providerId: "antigravity",
      sessionId: session.id,
    })
  ).rejects.toThrow("agy model not found");

  await adapter.sendTurn({ sessionId: session.id, text: "go" });
  const call = single(script.calls);
  const index = call.args.indexOf("--model");
  expect(call.args[index + 1]).toBe("Claude Opus 4.6 (Thinking)");
  script.children[0]?.close(0);
});

test("selectAgent switches the approval policy flag", async () => {
  const { adapter, projectId, script } = makeAdapter();
  const session = await adapter.createSession({ projectId });
  await adapter.selectAgent({
    agentId: "skip-permissions",
    sessionId: session.id,
  });
  await adapter.sendTurn({ sessionId: session.id, text: "go" });
  const call = single(script.calls);
  expect(call.args).toContain("--dangerously-skip-permissions");
  expect(call.args).not.toContain("--sandbox");
  script.children[0]?.close(0);

  await expect(
    adapter.selectAgent({ agentId: "yolo", sessionId: session.id })
  ).rejects.toThrow("approval policy not found");
});

test("archiving a cache-derived session suppresses its resurrection", async () => {
  await writeCache({ [workspace]: "cid-arch" });
  const { adapter } = makeAdapter();
  const session = single(await adapter.listSessions());
  await adapter.archiveSession({ sessionId: session.id });
  expect(await adapter.listSessions()).toEqual([]);
});

test("merges configured roots with cache workspaces into projects", async () => {
  const other = await mkdtemp(join(tmpdir(), "agy-other-"));
  try {
    await writeCache({ [other]: "cid-b" });
    const { adapter } = makeAdapter();
    const projects = await adapter.listProjects();
    expect(projects.map((project) => project.path).sort()).toEqual(
      [workspace, other].sort()
    );
  } finally {
    await rm(other, { force: true, recursive: true });
  }
});

test("lists and reads workspace files, guarding the project root", async () => {
  await writeFile(join(workspace, "a.txt"), "hello agy");
  await writeFile(join(workspace, "blob.bin"), Buffer.from([0, 1, 2, 0]));
  const { adapter, projectId } = makeAdapter();

  const nodes = await adapter.listFiles({ path: "", projectId });
  const names = nodes.map((node) => node.name);
  expect(names).toContain("a.txt");
  expect(names).toContain("blob.bin");

  const text = await adapter.readFile({ path: "a.txt", projectId });
  expect(text).toMatchObject({ content: "hello agy", type: "text" });

  const binary = await adapter.readFile({ path: "blob.bin", projectId });
  expect(binary).toMatchObject({ encoding: "base64", type: "binary" });

  await expect(
    adapter.readFile({ path: "../escape.txt", projectId })
  ).rejects.toThrow("escapes agy project");
});

test("exposes the recorded model list and approval agents in the catalog", async () => {
  const { adapter, projectId } = makeAdapter();
  const catalog = await adapter.listCatalog(projectId);
  expect(catalog.models.map((model) => model.id)).toEqual([...AGY_MODELS]);
  expect(catalog.agents.map((agent) => agent.id)).toEqual([
    "sandbox",
    "skip-permissions",
  ]);
  expect(catalog.providers.map((provider) => provider.id)).toEqual([
    "antigravity",
  ]);
});

test("reports health from binary resolvability", async () => {
  const missing = makeAdapter({ executable: "/definitely/not/here/agy" });
  expect((await missing.adapter.health()).healthy).toBe(false);

  const present = join(workspace, "agy");
  await writeFile(present, "#!/bin/sh\n");
  const found = makeAdapter({ executable: present });
  expect((await found.adapter.health()).healthy).toBe(true);
});

test("rejects operations on unknown live sessions with a restart hint", async () => {
  const { adapter } = makeAdapter();
  const ghost = agySessionId(
    agyLiveSessionKey("123e4567-e89b-42d3-a456-426614174000")
  );
  await expect(
    (async () => adapter.renameSession({ sessionId: ghost, title: "x" }))()
  ).rejects.toThrow("do not survive a host restart");
});

test("has no interactions and rejects permission or question responses", async () => {
  const { adapter, projectId } = makeAdapter();
  const session = await adapter.createSession({ projectId });
  expect(await adapter.listInteractions(session.id)).toEqual([]);
  await expect(
    adapter.respondPermission({
      decision: "once",
      requestId: "r1",
      sessionId: session.id,
    })
  ).rejects.toThrow("no permission protocol");
  await expect(
    adapter.respondQuestion({
      action: "reject",
      requestId: "r1",
      sessionId: session.id,
    })
  ).rejects.toThrow("no interactive question protocol");
  await expect(adapter.listFileChanges(projectId)).rejects.toThrow(
    "file.status is unsupported"
  );
});

test("replays a turn's events through subscribe from a cursor", async () => {
  const { adapter, projectId, script, store } = makeAdapter();
  const session = await adapter.createSession({ projectId });
  const cursor = store.events.at(-1)?.cursor;

  await adapter.sendTurn({ sessionId: session.id, text: "ping" });
  const child = single(script.children);
  child.stdout.emit("pong");
  child.close(0);

  const controller = new AbortController();
  const seen: string[] = [];
  for await (const event of adapter.subscribe(
    session.id,
    controller.signal,
    cursor
  )) {
    seen.push(event.kind);
    if (event.kind === "turn.completed") {
      controller.abort();
    }
  }

  expect(seen).toEqual([
    "turn.started",
    "timeline.item.upserted",
    "turn.completed",
  ]);
});
