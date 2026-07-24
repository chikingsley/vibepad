import {
  getSessionMessages,
  listSessions,
  query,
  renameSession,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * The structural slice of the Claude Agent SDK that the VibePad adapter
 * depends on. Tests supply fakes of this surface; production uses
 * {@link defaultClaudeCodeSdk}, which delegates to the real SDK. Nothing in
 * this module spawns Claude Code — only `query()` does, and only when the
 * adapter starts a session runtime.
 */

export type ClaudePermissionMode =
  | "acceptEdits"
  | "bypassPermissions"
  | "default"
  | "plan";

export type ClaudePermissionResult =
  | {
      readonly behavior: "allow";
      readonly updatedInput?: Record<string, unknown>;
      readonly updatedPermissions?: readonly unknown[];
    }
  | {
      readonly behavior: "deny";
      readonly interrupt?: boolean;
      readonly message: string;
    };

export interface ClaudeCanUseToolOptions {
  readonly agentID?: string;
  readonly blockedPath?: string;
  readonly decisionReason?: string;
  readonly description?: string;
  readonly displayName?: string;
  readonly signal: AbortSignal;
  readonly suggestions?: readonly unknown[];
  readonly title?: string;
  readonly toolUseID: string;
}

export type ClaudeCanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: ClaudeCanUseToolOptions
) => Promise<ClaudePermissionResult>;

export interface ClaudeUserMessageInput {
  readonly message: {
    readonly content: string;
    readonly role: "user";
  };
  readonly parent_tool_use_id: null;
  readonly session_id?: string;
  readonly type: "user";
}

export type ClaudeSettingSource = "local" | "project" | "user";

export interface ClaudeQueryOptions {
  readonly abortController?: AbortController;
  readonly allowDangerouslySkipPermissions?: boolean;
  readonly canUseTool?: ClaudeCanUseTool;
  readonly cwd: string;
  readonly model?: string;
  readonly pathToClaudeCodeExecutable?: string;
  readonly permissionMode?: ClaudePermissionMode;
  readonly resume?: string;
  readonly sessionId?: string;
  /**
   * Which filesystem settings layers the spawned runtime loads. Omitted
   * means all (Claude Code parity); `[]` isolates the session from
   * machine-local settings, allow rules, and hooks.
   */
  readonly settingSources?: readonly ClaudeSettingSource[];
}

export interface ClaudeQueryHandle extends AsyncIterable<unknown> {
  readonly close?: () => void;
  readonly interrupt: () => Promise<unknown>;
  readonly setModel?: (model?: string) => Promise<void>;
  readonly setPermissionMode?: (mode: ClaudePermissionMode) => Promise<void>;
}

export interface ClaudeSessionInfo {
  readonly createdAt?: number;
  readonly customTitle?: string;
  readonly cwd?: string;
  readonly firstPrompt?: string;
  readonly gitBranch?: string;
  readonly lastModified: number;
  readonly sessionId: string;
  readonly summary: string;
}

export interface ClaudeCodeSdk {
  readonly getSessionMessages: (
    sessionId: string,
    options?: {
      readonly dir?: string;
      readonly includeSystemMessages?: boolean;
    }
  ) => Promise<readonly unknown[]>;
  readonly listSessions: (options?: {
    readonly dir?: string;
    readonly limit?: number;
  }) => Promise<readonly ClaudeSessionInfo[]>;
  readonly query: (params: {
    readonly options: ClaudeQueryOptions;
    readonly prompt: AsyncIterable<ClaudeUserMessageInput>;
  }) => ClaudeQueryHandle;
  readonly renameSession: (
    sessionId: string,
    title: string,
    options?: { readonly dir?: string }
  ) => Promise<void>;
}

type RealQueryParameters = Parameters<typeof query>[0];

export const defaultClaudeCodeSdk: ClaudeCodeSdk = {
  getSessionMessages: (sessionId, options) =>
    getSessionMessages(sessionId, options),
  listSessions: (options) => listSessions(options),
  query: (params) =>
    // The structural facade narrows the SDK's Options and SDKUserMessage
    // types so tests can fake them; the runtime shapes match what the real
    // SDK accepts.
    query(params as unknown as RealQueryParameters) as ClaudeQueryHandle,
  renameSession: (sessionId, title, options) =>
    renameSession(sessionId, title, options),
};
