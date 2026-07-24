import { expect, it } from "vitest";

import { buildAgyArgs } from "./cli-args";

it("builds a fresh sandboxed turn with the prompt last", () => {
  const args = buildAgyArgs({
    addDirs: ["/work"],
    conversationId: null,
    printTimeout: "10m",
    prompt: "hello there",
    skipPermissions: false,
  });
  expect(args).toEqual([
    "--sandbox",
    "--add-dir",
    "/work",
    "--print-timeout",
    "10m",
    "--print",
    "hello there",
  ]);
});

it("resumes a pinned conversation via --conversation", () => {
  const args = buildAgyArgs({
    conversationId: "cid-123",
    prompt: "next",
    skipPermissions: false,
  });
  expect(args.slice(0, 2)).toEqual(["--conversation", "cid-123"]);
  expect(args.at(-1)).toBe("next");
});

it("passes the model display name through --model", () => {
  const args = buildAgyArgs({
    model: "Gemini 3.1 Pro (High)",
    prompt: "p",
    skipPermissions: false,
  });
  const index = args.indexOf("--model");
  expect(index).toBeGreaterThanOrEqual(0);
  expect(args[index + 1]).toBe("Gemini 3.1 Pro (High)");
});

it("maps skip-permissions onto --dangerously-skip-permissions", () => {
  const args = buildAgyArgs({ prompt: "p", skipPermissions: true });
  expect(args).toContain("--dangerously-skip-permissions");
  expect(args).not.toContain("--sandbox");
});

it("repeats --add-dir per directory", () => {
  const args = buildAgyArgs({
    addDirs: ["/a", "/b"],
    prompt: "p",
    skipPermissions: false,
  });
  expect(args.filter((arg) => arg === "--add-dir")).toHaveLength(2);
  expect(args).toContain("/a");
  expect(args).toContain("/b");
});

it("omits optional flags when unset", () => {
  const args = buildAgyArgs({ prompt: "p", skipPermissions: false });
  expect(args).toEqual(["--sandbox", "--print", "p"]);
});
