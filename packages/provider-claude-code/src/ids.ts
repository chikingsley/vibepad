import { Buffer } from "node:buffer";
import { basename } from "node:path";

const projectPrefix = "claude-code:project:";
const sessionPrefix = "claude-code:session:";

export const claudeCodeProjectId = (cwd: string) =>
  `${projectPrefix}${Buffer.from(cwd).toString("base64url")}`;

export const claudeCodeProjectPath = (projectId: string) => {
  if (!projectId.startsWith(projectPrefix)) {
    throw new Error(`Not a Claude Code project id: ${projectId}`);
  }
  return Buffer.from(
    projectId.slice(projectPrefix.length),
    "base64url"
  ).toString("utf8");
};

export const claudeCodeSessionId = (nativeSessionId: string) =>
  `${sessionPrefix}${nativeSessionId}`;

export const claudeCodeNativeSessionId = (sessionId: string) => {
  if (!sessionId.startsWith(sessionPrefix)) {
    throw new Error(`Not a Claude Code session id: ${sessionId}`);
  }
  return sessionId.slice(sessionPrefix.length);
};

export const isClaudeCodeProjectId = (id: string) =>
  id.startsWith(projectPrefix);
export const isClaudeCodeSessionId = (id: string) =>
  id.startsWith(sessionPrefix);

export const claudeCodeProjectName = (cwd: string) => basename(cwd) || cwd;
