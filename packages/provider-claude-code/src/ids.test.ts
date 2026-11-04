import { expect, it as test } from "vitest";

import {
  claudeCodeNativeSessionId,
  claudeCodeProjectId,
  claudeCodeProjectName,
  claudeCodeProjectPath,
  claudeCodeSessionId,
  isClaudeCodeProjectId,
  isClaudeCodeSessionId,
} from "./ids";

test("round-trips project ids through base64url paths", () => {
  const cwd = "/home/simon/github/vibepad";
  const projectId = claudeCodeProjectId(cwd);

  expect(projectId.startsWith("claude-code:project:")).toBe(true);
  expect(claudeCodeProjectPath(projectId)).toBe(cwd);
  expect(isClaudeCodeProjectId(projectId)).toBe(true);
  expect(claudeCodeProjectName(cwd)).toBe("vibepad");
});

test("round-trips session ids with the claude-code namespace", () => {
  const nativeId = "3f4c9a52-70bb-4ff0-9605-15c4e2f4bd11";
  const sessionId = claudeCodeSessionId(nativeId);

  expect(sessionId).toBe(`claude-code:session:${nativeId}`);
  expect(claudeCodeNativeSessionId(sessionId)).toBe(nativeId);
  expect(isClaudeCodeSessionId(sessionId)).toBe(true);
});

test("rejects foreign ids instead of guessing", () => {
  expect(() => claudeCodeProjectPath("codex:project:abc")).toThrow(
    "Not a Claude Code project id"
  );
  expect(() => claudeCodeNativeSessionId("opencode:session:ses_1")).toThrow(
    "Not a Claude Code session id"
  );
  expect(isClaudeCodeSessionId("codex:thread:abc")).toBe(false);
});
