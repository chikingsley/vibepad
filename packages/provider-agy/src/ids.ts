import { basename } from "node:path";
import type { HarnessId } from "@vibepad/protocol/provider";

const projectPrefix = "agy:project:";
const sessionPrefix = "agy:session:";
const cachedKeyPrefix = "cached.";
const liveKeyPrefix = "live.";

export const agyHarnessId: HarnessId = "agy";

export const agyProjectId = (cwd: string) =>
  `${projectPrefix}${Buffer.from(cwd).toString("base64url")}`;

export const agyProjectPath = (projectId: string) => {
  if (!projectId.startsWith(projectPrefix)) {
    throw new Error(`Not an agy project id: ${projectId}`);
  }
  return Buffer.from(
    projectId.slice(projectPrefix.length),
    "base64url"
  ).toString("utf8");
};

export const agyProjectName = (cwd: string) => basename(cwd) || cwd;

/** Session key for a session created live in this adapter process. */
export const agyLiveSessionKey = (uuid: string) => `${liveKeyPrefix}${uuid}`;

/**
 * Session key for a session derived from agy's cwd conversation cache. It
 * encodes both the workspace and the conversation id so the session can be
 * rematerialized (and resumed via `--conversation`) after a host restart.
 */
export const agyCachedSessionKey = (cwd: string, conversationId: string) =>
  `${cachedKeyPrefix}${Buffer.from(JSON.stringify([cwd, conversationId])).toString("base64url")}`;

const parseCachedKeyPayload = (key: string): unknown => {
  try {
    return JSON.parse(
      Buffer.from(key.slice(cachedKeyPrefix.length), "base64url").toString(
        "utf8"
      )
    );
  } catch {
    return null;
  }
};

export const decodeCachedSessionKey = (
  key: string
): { readonly conversationId: string; readonly cwd: string } | undefined => {
  if (!key.startsWith(cachedKeyPrefix)) {
    return;
  }
  const decoded = parseCachedKeyPayload(key);
  if (
    Array.isArray(decoded) &&
    typeof decoded[0] === "string" &&
    typeof decoded[1] === "string"
  ) {
    return { conversationId: decoded[1], cwd: decoded[0] };
  }
};

export const agySessionId = (key: string) => `${sessionPrefix}${key}`;

export const agySessionKey = (sessionId: string) => {
  if (!sessionId.startsWith(sessionPrefix)) {
    throw new Error(`Not an agy session id: ${sessionId}`);
  }
  return sessionId.slice(sessionPrefix.length);
};

export const isAgyProjectId = (id: string) => id.startsWith(projectPrefix);
export const isAgySessionId = (id: string) => id.startsWith(sessionPrefix);
