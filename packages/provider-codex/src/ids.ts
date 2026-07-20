import { basename } from "node:path";

const projectPrefix = "codex:project:";
const sessionPrefix = "codex:thread:";

export const codexProjectId = (cwd: string) =>
  `${projectPrefix}${Buffer.from(cwd).toString("base64url")}`;

export const codexProjectPath = (projectId: string) => {
  if (!projectId.startsWith(projectPrefix)) {
    throw new Error(`Not a Codex project id: ${projectId}`);
  }
  return Buffer.from(
    projectId.slice(projectPrefix.length),
    "base64url"
  ).toString("utf8");
};

export const codexSessionId = (threadId: string) =>
  `${sessionPrefix}${threadId}`;

export const codexThreadId = (sessionId: string) => {
  if (!sessionId.startsWith(sessionPrefix)) {
    throw new Error(`Not a Codex session id: ${sessionId}`);
  }
  return sessionId.slice(sessionPrefix.length);
};

export const isCodexProjectId = (id: string) => id.startsWith(projectPrefix);
export const isCodexSessionId = (id: string) => id.startsWith(sessionPrefix);

export const codexProjectName = (cwd: string) => basename(cwd) || cwd;
