import { expect, it as test } from "vitest";

import { type AgyTurn, mapAgyTurns } from "./timeline";

const completedTurn: AgyTurn = {
  completedAt: 1_700_000_003_000,
  id: "turn-1",
  output: "The answer is **42**.",
  prompt: "What is the answer?",
  startedAt: 1_700_000_000_000,
  status: "completed",
};

test("projects a completed turn into a user and an assistant message", () => {
  const items = mapAgyTurns("agy:session:live.a", [completedTurn]);
  expect(items).toHaveLength(2);
  expect(items[0]).toMatchObject({
    id: "turn-1:user",
    kind: "message",
    role: "user",
    sessionId: "agy:session:live.a",
    turnId: "turn-1",
  });
  expect(items[0]?.parts[0]).toMatchObject({
    format: "plain",
    text: "What is the answer?",
    type: "text",
  });
  expect(items[1]).toMatchObject({
    completedAt: new Date(1_700_000_003_000).toISOString(),
    id: "turn-1:assistant",
    role: "assistant",
  });
  expect(items[1]?.parts[0]).toMatchObject({
    format: "markdown",
    text: "The answer is **42**.",
  });
});

test("keeps a running turn's partial output visible", () => {
  const items = mapAgyTurns("agy:session:live.a", [
    {
      id: "turn-2",
      output: "Thinking",
      prompt: "go",
      startedAt: 1_700_000_000_000,
      status: "running",
    },
  ]);
  expect(items).toHaveLength(2);
  expect(items[1]).not.toHaveProperty("completedAt");
  expect(items[1]?.parts[0]).toMatchObject({ text: "Thinking" });
});

test("adds an error notice for failed turns and drops empty assistant output", () => {
  const items = mapAgyTurns("agy:session:live.a", [
    {
      completedAt: 1_700_000_001_000,
      error: "agy exited with code 1",
      id: "turn-3",
      output: "",
      prompt: "go",
      startedAt: 1_700_000_000_000,
      status: "failed",
    },
  ]);
  expect(items).toHaveLength(2);
  expect(items[1]).toMatchObject({ id: "turn-3:error", kind: "notice" });
  expect(items[1]?.parts[0]).toMatchObject({ text: "agy exited with code 1" });
});

test("keeps partial output and the notice for failed turns with output", () => {
  const items = mapAgyTurns("agy:session:live.a", [
    {
      completedAt: 1_700_000_001_000,
      error: "killed",
      id: "turn-4",
      output: "partial answer",
      prompt: "go",
      startedAt: 1_700_000_000_000,
      status: "failed",
    },
  ]);
  expect(items.map((item) => item.id)).toEqual([
    "turn-4:user",
    "turn-4:assistant",
    "turn-4:error",
  ]);
});
