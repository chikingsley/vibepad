import { expect, it } from "vitest";

import {
  agyCachedSessionKey,
  agyLiveSessionKey,
  agyProjectId,
  agyProjectPath,
  agySessionId,
  agySessionKey,
  decodeCachedSessionKey,
  isAgyProjectId,
  isAgySessionId,
} from "./ids";

it("round-trips project ids through base64url", () => {
  const id = agyProjectId("/home/user/my project");
  expect(isAgyProjectId(id)).toBe(true);
  expect(agyProjectPath(id)).toBe("/home/user/my project");
});

it("rejects foreign project and session ids", () => {
  expect(() => agyProjectPath("codex:project:xyz")).toThrow(
    "Not an agy project id"
  );
  expect(() => agySessionKey("codex:thread:xyz")).toThrow(
    "Not an agy session id"
  );
});

it("round-trips cache-derived session keys with cwd and conversation id", () => {
  const key = agyCachedSessionKey("/work/app", "cid-42");
  const sessionId = agySessionId(key);
  expect(isAgySessionId(sessionId)).toBe(true);
  expect(decodeCachedSessionKey(agySessionKey(sessionId))).toEqual({
    conversationId: "cid-42",
    cwd: "/work/app",
  });
});

it("does not decode live session keys as cached ones", () => {
  const key = agyLiveSessionKey("123e4567-e89b-42d3-a456-426614174000");
  expect(decodeCachedSessionKey(key)).toBeUndefined();
});
