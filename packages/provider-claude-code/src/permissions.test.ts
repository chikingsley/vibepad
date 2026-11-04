import type { PendingInteraction } from "@vibepad/protocol/interactions";
import { expect, it as test } from "vitest";

import {
  ClaudeCodePermissionBroker,
  claudeToolDescriptor,
} from "./permissions";
import type { ClaudeCanUseToolOptions } from "./sdk";

const sessionId = "claude-code:session:22222222-2222-4222-8222-222222222222";

interface Recorded {
  readonly exitPlanApproved: string[];
  readonly requested: PendingInteraction[];
  readonly resolved: PendingInteraction[];
}

const createBroker = (): { broker: ClaudeCodePermissionBroker } & Recorded => {
  const exitPlanApproved: string[] = [];
  const requested: PendingInteraction[] = [];
  const resolved: PendingInteraction[] = [];
  const broker = new ClaudeCodePermissionBroker({
    onExitPlanApproved: (id) => exitPlanApproved.push(id),
    onRequested: (interaction) => requested.push(interaction),
    onResolved: (interaction) => resolved.push(interaction),
  });
  return { broker, exitPlanApproved, requested, resolved };
};

const callOptions = (
  toolUseID: string,
  extra: Partial<ClaudeCanUseToolOptions> = {}
): ClaudeCanUseToolOptions => ({
  signal: new AbortController().signal,
  toolUseID,
  ...extra,
});

test("classifies Claude tools like Happy's descriptor table", () => {
  expect(claudeToolDescriptor("ExitPlanMode").exitPlan).toBe(true);
  expect(claudeToolDescriptor("Edit")).toEqual({
    dangerous: true,
    edit: true,
    exitPlan: false,
  });
  expect(claudeToolDescriptor("Bash").dangerous).toBe(true);
  expect(claudeToolDescriptor("Read")).toEqual({
    dangerous: false,
    edit: false,
    exitPlan: false,
  });
});

test("projects a Bash ask into a VibePad permission interaction", async () => {
  const { broker, requested } = createBroker();
  const canUseTool = broker.canUseToolFor(sessionId);

  const pending = canUseTool(
    "Bash",
    { command: "rm -rf build" },
    callOptions("toolu_1", { title: "Claude wants to run rm -rf build" })
  );

  expect(requested).toHaveLength(1);
  expect(requested[0]).toMatchObject({
    action: "Claude wants to run rm -rf build",
    id: "toolu_1",
    kind: "permission",
    metadata: { toolName: "Bash", toolUseId: "toolu_1" },
    resources: ["rm -rf build"],
    save: ["session"],
    sessionId,
  });
  expect(broker.pendingInputFor(sessionId)).toBe("permission");

  broker.respondPermission({
    decision: "once",
    requestId: "toolu_1",
    sessionId,
  });
  await expect(pending).resolves.toEqual({
    behavior: "allow",
    updatedInput: { command: "rm -rf build" },
  });
  expect(broker.listPending(sessionId)).toHaveLength(0);
});

test("denies with the caller's message and Happy's stop message by default", async () => {
  const { broker, resolved } = createBroker();
  const canUseTool = broker.canUseToolFor(sessionId);

  const first = canUseTool("Write", { file_path: "/a" }, callOptions("t1"));
  broker.respondPermission({
    decision: "reject",
    message: "Do not touch /a",
    requestId: "t1",
    sessionId,
  });
  const second = canUseTool("Write", { file_path: "/b" }, callOptions("t2"));
  broker.respondPermission({ decision: "reject", requestId: "t2", sessionId });

  await expect(first).resolves.toEqual({
    behavior: "deny",
    message: "Do not touch /a",
  });
  const secondResult = await second;
  expect(secondResult.behavior).toBe("deny");
  expect(secondResult.behavior === "deny" && secondResult.message).toContain(
    "STOP what you are doing"
  );
  expect(resolved).toHaveLength(2);
});

test("returns SDK permission suggestions and remembers always-allowed tools", async () => {
  const { broker } = createBroker();
  const canUseTool = broker.canUseToolFor(sessionId);
  const suggestions = [
    {
      behavior: "allow",
      destination: "session",
      rules: [{ ruleContent: "bun test", toolName: "Bash" }],
      type: "addRules",
    },
  ];

  const first = canUseTool(
    "Bash",
    { command: "bun test" },
    callOptions("t1", { suggestions })
  );
  broker.respondPermission({
    decision: "always",
    requestId: "t1",
    sessionId,
  });
  await expect(first).resolves.toEqual({
    behavior: "allow",
    updatedInput: { command: "bun test" },
    updatedPermissions: suggestions,
  });

  // The identical Bash command is auto-allowed without a new interaction.
  await expect(
    canUseTool("Bash", { command: "bun test" }, callOptions("t2"))
  ).resolves.toEqual({
    behavior: "allow",
    updatedInput: { command: "bun test" },
  });
  // A different command still asks.
  const different = canUseTool(
    "Bash",
    { command: "rm -rf /" },
    callOptions("t3")
  );
  expect(broker.pendingInputFor(sessionId)).toBe("permission");
  broker.respondPermission({ decision: "reject", requestId: "t3", sessionId });
  await different;
});

test("applies edited tool input on approval", async () => {
  const { broker } = createBroker();
  const canUseTool = broker.canUseToolFor(sessionId);

  const pending = canUseTool(
    "Bash",
    { command: "rm -rf /", description: "Cleanup" },
    callOptions("t1")
  );
  broker.respondPermission(
    { decision: "once", requestId: "t1", sessionId },
    { command: "rm -rf ./build" }
  );

  await expect(pending).resolves.toEqual({
    behavior: "allow",
    updatedInput: { command: "rm -rf ./build", description: "Cleanup" },
  });
});

test("honors permission modes: acceptEdits, plan, and bypassPermissions", async () => {
  const { broker } = createBroker();
  const canUseTool = broker.canUseToolFor(sessionId);

  broker.setMode(sessionId, "acceptEdits");
  await expect(
    canUseTool("Edit", { file_path: "/a" }, callOptions("t1"))
  ).resolves.toMatchObject({ behavior: "allow" });

  broker.setMode(sessionId, "plan");
  await expect(
    canUseTool("Read", { file_path: "/a" }, callOptions("t2"))
  ).resolves.toMatchObject({ behavior: "allow" });
  const dangerous = canUseTool(
    "Bash",
    { command: "rm -rf /" },
    callOptions("t3")
  );
  expect(broker.pendingInputFor(sessionId)).toBe("permission");
  broker.respondPermission({ decision: "reject", requestId: "t3", sessionId });
  await dangerous;

  broker.setMode(sessionId, "bypassPermissions");
  await expect(
    canUseTool("Bash", { command: "anything" }, callOptions("t4"))
  ).resolves.toMatchObject({ behavior: "allow" });
});

test("switches back to default mode when an ExitPlanMode approval lands", async () => {
  const { broker, exitPlanApproved } = createBroker();
  const canUseTool = broker.canUseToolFor(sessionId);
  broker.setMode(sessionId, "plan");

  const pending = canUseTool(
    "ExitPlanMode",
    { plan: "Ship it" },
    callOptions("t1")
  );
  broker.respondPermission({ decision: "once", requestId: "t1", sessionId });

  await expect(pending).resolves.toMatchObject({ behavior: "allow" });
  expect(broker.modeFor(sessionId)).toBe("default");
  expect(exitPlanApproved).toEqual([sessionId]);
});

test("projects AskUserQuestion as a question and answers via edited input", async () => {
  const { broker, requested } = createBroker();
  const canUseTool = broker.canUseToolFor(sessionId);
  broker.setMode(sessionId, "bypassPermissions");

  const input = {
    questions: [
      {
        header: "Library",
        multiSelect: false,
        options: [
          { description: "Small", label: "date-fns" },
          { description: "Classic", label: "moment" },
        ],
        question: "Which library should we use?",
      },
    ],
  };
  // Even bypassPermissions must not auto-answer a user question.
  const pending = canUseTool("AskUserQuestion", input, callOptions("t1"));

  expect(requested[0]).toMatchObject({
    kind: "question",
    questions: [
      {
        custom: true,
        header: "Library",
        multiple: false,
        options: [
          { description: "Small", label: "date-fns" },
          { description: "Classic", label: "moment" },
        ],
        question: "Which library should we use?",
      },
    ],
  });
  expect(broker.pendingInputFor(sessionId)).toBe("question");

  broker.respondQuestion({
    action: "answer",
    answers: [["date-fns"]],
    requestId: "t1",
    sessionId,
  });
  await expect(pending).resolves.toEqual({
    behavior: "allow",
    updatedInput: {
      ...input,
      answers: { "Which library should we use?": "date-fns" },
    },
  });
});

test("denies dismissed questions and aborted requests", async () => {
  const { broker } = createBroker();
  const canUseTool = broker.canUseToolFor(sessionId);

  const question = canUseTool(
    "AskUserQuestion",
    { questions: [{ header: "Q", options: [], question: "Pick one?" }] },
    callOptions("t1")
  );
  broker.respondQuestion({ action: "reject", requestId: "t1", sessionId });
  await expect(question).resolves.toMatchObject({ behavior: "deny" });

  const controller = new AbortController();
  const aborted = canUseTool(
    "Bash",
    { command: "sleep 1" },
    callOptions("t2", { signal: controller.signal })
  );
  controller.abort();
  await expect(aborted).resolves.toEqual({
    behavior: "deny",
    message: "The permission request was aborted.",
  });
  expect(broker.listPending(sessionId)).toHaveLength(0);
});

test("scopes agent-namespaced request ids and rejects unknown responses", async () => {
  const { broker } = createBroker();
  const canUseTool = broker.canUseToolFor(sessionId);

  const pending = canUseTool(
    "Read",
    { file_path: "/a" },
    callOptions("toolu_9", { agentID: "agent-1" })
  );
  expect(broker.listPending(sessionId)[0]?.id).toBe("agent-1:toolu_9");
  broker.respondPermission({
    decision: "once",
    requestId: "agent-1:toolu_9",
    sessionId,
  });
  await pending;

  expect(() =>
    broker.respondPermission({
      decision: "once",
      requestId: "missing",
      sessionId,
    })
  ).toThrow("permission request not found");
  expect(() =>
    broker.respondQuestion({
      action: "reject",
      requestId: "missing",
      sessionId,
    })
  ).toThrow("question request not found");
});
