import type {
  PendingInteraction,
  QuestionInfo,
  RespondPermissionInput,
  RespondQuestionInput,
} from "@vibepad/protocol/interactions";

import type {
  ClaudeCanUseTool,
  ClaudeCanUseToolOptions,
  ClaudePermissionMode,
  ClaudePermissionResult,
} from "./sdk";

/**
 * Bridges the Agent SDK's `canUseTool` callback to VibePad's pending
 * interaction contract. Ported from Happy CLI's PermissionHandler: permission
 * modes gate auto-approval, "always" answers feed a remembered allow-list
 * (tool names, Bash literals and prefixes), and approvals can carry edited
 * tool input back to the SDK.
 */

export interface ClaudeToolDescriptor {
  readonly dangerous: boolean;
  readonly edit: boolean;
  readonly exitPlan: boolean;
}

export const claudeToolDescriptor = (
  toolName: string
): ClaudeToolDescriptor => {
  if (toolName === "ExitPlanMode" || toolName === "exit_plan_mode") {
    return { dangerous: false, edit: false, exitPlan: true };
  }
  if (
    toolName === "Edit" ||
    toolName === "MultiEdit" ||
    toolName === "NotebookEdit" ||
    toolName === "Write"
  ) {
    return { dangerous: true, edit: true, exitPlan: false };
  }
  if (toolName === "Bash") {
    return { dangerous: true, edit: false, exitPlan: false };
  }
  return { dangerous: false, edit: false, exitPlan: false };
};

const deniedMessage =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.";

interface PendingClaudePermission {
  readonly input: Record<string, unknown>;
  readonly interaction: PendingInteraction;
  readonly options: ClaudeCanUseToolOptions;
  readonly resolve: (result: ClaudePermissionResult) => void;
  readonly sessionId: string;
  readonly toolName: string;
}

interface SessionAllowList {
  readonly bashLiterals: Set<string>;
  readonly bashPrefixes: Set<string>;
  readonly tools: Set<string>;
}

export interface ClaudeCodePermissionBrokerEvents {
  readonly onExitPlanApproved?: (sessionId: string) => void;
  readonly onRequested: (interaction: PendingInteraction) => void;
  readonly onResolved: (interaction: PendingInteraction) => void;
}

const stringInput = (input: Record<string, unknown>, key: string) => {
  const value = Reflect.get(input, key);
  return typeof value === "string" ? value : undefined;
};

const permissionResources = (
  toolName: string,
  input: Record<string, unknown>,
  options: ClaudeCanUseToolOptions
): string[] =>
  [
    toolName === "Bash" ? stringInput(input, "command") : undefined,
    stringInput(input, "file_path"),
    stringInput(input, "notebook_path"),
    stringInput(input, "url"),
    options.blockedPath,
  ].filter((value): value is string => Boolean(value));

const askUserQuestions = (input: Record<string, unknown>): QuestionInfo[] => {
  const questions = Reflect.get(input, "questions");
  if (!Array.isArray(questions)) {
    return [];
  }
  return questions.flatMap((question): QuestionInfo[] => {
    if (typeof question !== "object" || question === null) {
      return [];
    }
    const record = question as Record<string, unknown>;
    const text = stringInput(record, "question");
    const header = stringInput(record, "header");
    if (!(text && header)) {
      return [];
    }
    const options = Reflect.get(record, "options");
    return [
      {
        custom: true,
        header,
        multiple: Reflect.get(record, "multiSelect") === true,
        options: Array.isArray(options)
          ? options.flatMap((option) => {
              if (typeof option !== "object" || option === null) {
                return [];
              }
              const optionRecord = option as Record<string, unknown>;
              const label = stringInput(optionRecord, "label");
              return label
                ? [
                    {
                      description:
                        stringInput(optionRecord, "description") ?? "",
                      label,
                    },
                  ]
                : [];
            })
          : [],
        question: text,
      },
    ];
  });
};

export class ClaudeCodePermissionBroker {
  readonly #allowLists = new Map<string, SessionAllowList>();
  readonly #events: ClaudeCodePermissionBrokerEvents;
  readonly #modes = new Map<string, ClaudePermissionMode>();
  readonly #pending = new Map<string, PendingClaudePermission>();

  constructor(events: ClaudeCodePermissionBrokerEvents) {
    this.#events = events;
  }

  modeFor(sessionId: string): ClaudePermissionMode {
    return this.#modes.get(sessionId) ?? "default";
  }

  setMode(sessionId: string, mode: ClaudePermissionMode): void {
    this.#modes.set(sessionId, mode);
  }

  canUseToolFor(sessionId: string): ClaudeCanUseTool {
    return (toolName, input, options) =>
      this.#handleToolCall(sessionId, toolName, input, options);
  }

  listPending(sessionId: string): readonly PendingInteraction[] {
    return [...this.#pending.values()]
      .filter((pending) => pending.sessionId === sessionId)
      .map((pending) => pending.interaction);
  }

  pendingInputFor(sessionId: string): "permission" | "question" | undefined {
    let question = false;
    for (const pending of this.#pending.values()) {
      if (pending.sessionId !== sessionId) {
        continue;
      }
      if (pending.interaction.kind === "permission") {
        return "permission";
      }
      question = true;
    }
    return question ? "question" : undefined;
  }

  respondPermission(
    input: RespondPermissionInput,
    editedInput?: Record<string, unknown>
  ): void {
    const pending = this.#pending.get(input.requestId);
    if (!(pending && pending.interaction.kind === "permission")) {
      throw new Error(
        `Claude Code permission request not found: ${input.requestId}`
      );
    }
    this.#pending.delete(input.requestId);
    if (input.decision === "reject") {
      pending.resolve({
        behavior: "deny",
        message: input.message ?? deniedMessage,
      });
      this.#events.onResolved(pending.interaction);
      return;
    }
    if (input.decision === "always") {
      this.#remember(pending.sessionId, pending.toolName, pending.input);
    }
    if (claudeToolDescriptor(pending.toolName).exitPlan) {
      this.#modes.set(pending.sessionId, "default");
      this.#events.onExitPlanApproved?.(pending.sessionId);
    }
    pending.resolve({
      behavior: "allow",
      updatedInput: { ...pending.input, ...editedInput },
      ...(input.decision === "always" && pending.options.suggestions?.length
        ? { updatedPermissions: pending.options.suggestions }
        : {}),
    });
    this.#events.onResolved(pending.interaction);
  }

  respondQuestion(input: RespondQuestionInput): void {
    const pending = this.#pending.get(input.requestId);
    if (!(pending && pending.interaction.kind === "question")) {
      throw new Error(
        `Claude Code question request not found: ${input.requestId}`
      );
    }
    this.#pending.delete(input.requestId);
    if (input.action === "reject") {
      pending.resolve({
        behavior: "deny",
        message: "The user dismissed the question without answering.",
      });
      this.#events.onResolved(pending.interaction);
      return;
    }
    const answers: Record<string, string> = {};
    for (const [index, question] of pending.interaction.questions.entries()) {
      const answer = input.answers[index];
      if (answer && answer.length > 0) {
        answers[question.question] = answer.join(", ");
      }
    }
    pending.resolve({
      behavior: "allow",
      updatedInput: { ...pending.input, answers },
    });
    this.#events.onResolved(pending.interaction);
  }

  reset(sessionId: string, reason: string): void {
    for (const [requestId, pending] of this.#pending) {
      if (pending.sessionId !== sessionId) {
        continue;
      }
      this.#pending.delete(requestId);
      pending.resolve({ behavior: "deny", message: reason });
      this.#events.onResolved(pending.interaction);
    }
  }

  #handleToolCall(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>,
    options: ClaudeCanUseToolOptions
  ): Promise<ClaudePermissionResult> {
    // AskUserQuestion requires the user, regardless of permission mode.
    if (toolName === "AskUserQuestion") {
      return this.#ask(sessionId, toolName, input, options, "question");
    }
    if (this.#isRemembered(sessionId, toolName, input)) {
      return Promise.resolve({ behavior: "allow", updatedInput: input });
    }
    const descriptor = claudeToolDescriptor(toolName);
    // ExitPlanMode always requires explicit approval.
    if (descriptor.exitPlan) {
      return this.#ask(sessionId, toolName, input, options, "permission");
    }
    const mode = this.modeFor(sessionId);
    if (mode === "bypassPermissions") {
      return Promise.resolve({ behavior: "allow", updatedInput: input });
    }
    if (mode === "acceptEdits" && descriptor.edit) {
      return Promise.resolve({ behavior: "allow", updatedInput: input });
    }
    if (mode === "plan" && !descriptor.dangerous) {
      return Promise.resolve({ behavior: "allow", updatedInput: input });
    }
    return this.#ask(sessionId, toolName, input, options, "permission");
  }

  #ask(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>,
    options: ClaudeCanUseToolOptions,
    kind: "permission" | "question"
  ): Promise<ClaudePermissionResult> {
    const requestId = options.agentID
      ? `${options.agentID}:${options.toolUseID}`
      : options.toolUseID;
    const native = { input, options, toolName };
    const interaction: PendingInteraction =
      kind === "question"
        ? {
            id: requestId,
            kind: "question",
            native,
            questions: askUserQuestions(input),
            sessionId,
          }
        : {
            action: options.title ?? options.displayName ?? `Use ${toolName}`,
            id: requestId,
            kind: "permission",
            metadata: {
              ...(options.blockedPath
                ? { blockedPath: options.blockedPath }
                : {}),
              ...(options.decisionReason
                ? { decisionReason: options.decisionReason }
                : {}),
              ...(options.description
                ? { description: options.description }
                : {}),
              toolName,
              toolUseId: options.toolUseID,
            },
            native,
            resources: permissionResources(toolName, input, options),
            save: ["session"],
            sessionId,
          };
    return new Promise<ClaudePermissionResult>((resolve) => {
      const abort = () => {
        if (!this.#pending.delete(requestId)) {
          return;
        }
        resolve({
          behavior: "deny",
          message: "The permission request was aborted.",
        });
        this.#events.onResolved(interaction);
      };
      options.signal.addEventListener("abort", abort, { once: true });
      this.#pending.set(requestId, {
        input,
        interaction,
        options,
        resolve: (result) => {
          options.signal.removeEventListener("abort", abort);
          resolve(result);
        },
        sessionId,
        toolName,
      });
      this.#events.onRequested(interaction);
    });
  }

  #allowListFor(sessionId: string): SessionAllowList {
    const existing = this.#allowLists.get(sessionId);
    if (existing) {
      return existing;
    }
    const created: SessionAllowList = {
      bashLiterals: new Set(),
      bashPrefixes: new Set(),
      tools: new Set(),
    };
    this.#allowLists.set(sessionId, created);
    return created;
  }

  #remember(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>
  ): void {
    const allowList = this.#allowListFor(sessionId);
    if (toolName === "Bash") {
      const command = stringInput(input, "command");
      if (command) {
        allowList.bashLiterals.add(command);
      }
      return;
    }
    if (!claudeToolDescriptor(toolName).exitPlan) {
      allowList.tools.add(toolName);
    }
  }

  #isRemembered(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>
  ): boolean {
    const allowList = this.#allowLists.get(sessionId);
    if (!allowList) {
      return false;
    }
    if (toolName === "Bash") {
      const command = stringInput(input, "command");
      if (!command) {
        return false;
      }
      if (allowList.bashLiterals.has(command)) {
        return true;
      }
      for (const prefix of allowList.bashPrefixes) {
        if (command.startsWith(prefix)) {
          return true;
        }
      }
      return false;
    }
    return allowList.tools.has(toolName);
  }
}
