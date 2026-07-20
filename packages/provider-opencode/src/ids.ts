import { Buffer } from "node:buffer";

const projectPrefix = "opencode:project:";
const sessionPrefix = "opencode:session:";

export const openCodeProjectId = (projectId: string) =>
  projectId.startsWith(projectPrefix)
    ? projectId
    : `${projectPrefix}${Buffer.from(projectId).toString("base64url")}`;

export const openCodeNativeProjectId = (projectId: string) => {
  if (!projectId.startsWith(projectPrefix)) {
    throw new Error(`Not an OpenCode project id: ${projectId}`);
  }
  return Buffer.from(
    projectId.slice(projectPrefix.length),
    "base64url"
  ).toString("utf8");
};

export const openCodeSessionId = (sessionId: string) =>
  sessionId.startsWith(sessionPrefix)
    ? sessionId
    : `${sessionPrefix}${sessionId}`;

export const openCodeNativeSessionId = (sessionId: string) => {
  if (sessionId.startsWith("ses_")) {
    return sessionId;
  }
  if (!sessionId.startsWith(sessionPrefix)) {
    throw new Error(`Not an OpenCode session id: ${sessionId}`);
  }
  return sessionId.slice(sessionPrefix.length);
};
