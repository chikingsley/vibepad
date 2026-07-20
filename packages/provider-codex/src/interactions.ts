import type {
  PendingInteraction,
  PermissionDecision,
  QuestionInfo,
  RespondQuestionInput,
} from "@vibepad/protocol/interactions";

import type { CommandExecutionRequestApprovalParams } from "../generated/v2/CommandExecutionRequestApprovalParams";
import type { FileChangeRequestApprovalParams } from "../generated/v2/FileChangeRequestApprovalParams";
import type { McpElicitationPrimitiveSchema } from "../generated/v2/McpElicitationPrimitiveSchema";
import type { McpServerElicitationRequestParams } from "../generated/v2/McpServerElicitationRequestParams";
import type { PermissionsRequestApprovalParams } from "../generated/v2/PermissionsRequestApprovalParams";
import type { ToolRequestUserInputParams } from "../generated/v2/ToolRequestUserInputParams";
import type { CodexServerRequest } from "./app-server-client";
import { codexSessionId } from "./ids";

export interface PendingCodexInteraction {
  readonly interaction: PendingInteraction;
  readonly request: CodexServerRequest;
}

const optionsForMcpSchema = (schema: McpElicitationPrimitiveSchema) => {
  if ("oneOf" in schema) {
    return schema.oneOf.map((option) => ({
      description: "",
      label: option.title || option.const,
    }));
  }
  if ("enum" in schema) {
    return schema.enum.map((value, index) => ({
      description: "",
      label:
        "enumNames" in schema ? (schema.enumNames?.[index] ?? value) : value,
    }));
  }
  if ("items" in schema) {
    const values =
      "anyOf" in schema.items
        ? schema.items.anyOf.map((option) => ({
            description: "",
            label: option.title || option.const,
          }))
        : schema.items.enum.map((value) => ({
            description: "",
            label: value,
          }));
    return values;
  }
  if (schema.type === "boolean") {
    return [
      { description: "", label: "True" },
      { description: "", label: "False" },
    ];
  }
  return [];
};

const mcpFormQuestions = (
  params: Extract<McpServerElicitationRequestParams, { mode: "form" }>
): QuestionInfo[] =>
  Object.entries(params.requestedSchema.properties).flatMap(
    ([name, schema]) => {
      if (!schema) {
        return [];
      }
      const options = optionsForMcpSchema(schema);
      return [
        {
          custom: options.length === 0,
          header: schema.title ?? name,
          multiple: schema.type === "array",
          options,
          question: schema.description ?? params.message,
        },
      ];
    }
  );

const projectCommandPermission = (
  request: CodexServerRequest,
  params: CommandExecutionRequestApprovalParams
): PendingCodexInteraction => ({
  interaction: {
    action: params.reason ?? params.command ?? "Run command",
    id: String(request.id),
    kind: "permission",
    metadata: {
      approvalId: params.approvalId,
      command: params.command,
      cwd: params.cwd,
      environmentId: params.environmentId,
      method: request.method,
    },
    native: request,
    resources: [params.cwd, params.command].filter((value): value is string =>
      Boolean(value)
    ),
    save: params.availableDecisions?.includes("acceptForSession")
      ? ["session"]
      : [],
    sessionId: codexSessionId(params.threadId),
  },
  request,
});

const projectFilePermission = (
  request: CodexServerRequest,
  params: FileChangeRequestApprovalParams
): PendingCodexInteraction => ({
  interaction: {
    action: params.reason ?? "Apply file changes",
    id: String(request.id),
    kind: "permission",
    metadata: { grantRoot: params.grantRoot, method: request.method },
    native: request,
    resources: params.grantRoot ? [params.grantRoot] : [],
    save: params.grantRoot ? ["session"] : [],
    sessionId: codexSessionId(params.threadId),
  },
  request,
});

const projectProfilePermission = (
  request: CodexServerRequest,
  params: PermissionsRequestApprovalParams
): PendingCodexInteraction => ({
  interaction: {
    action: params.reason ?? "Grant additional permissions",
    id: String(request.id),
    kind: "permission",
    metadata: {
      environmentId: params.environmentId,
      method: request.method,
      permissions: params.permissions,
    },
    native: request,
    resources: [params.cwd],
    save: ["session"],
    sessionId: codexSessionId(params.threadId),
  },
  request,
});

const projectQuestion = (
  request: CodexServerRequest,
  params: ToolRequestUserInputParams
): PendingCodexInteraction => ({
  interaction: {
    id: String(request.id),
    kind: "question",
    native: request,
    questions: params.questions.map((question) => ({
      custom: question.isOther,
      header: question.header,
      multiple: false,
      options: question.options ?? [],
      question: question.question,
    })),
    sessionId: codexSessionId(params.threadId),
  },
  request,
});

const projectMcpQuestion = (
  request: CodexServerRequest,
  params: McpServerElicitationRequestParams
): PendingCodexInteraction => {
  const questions =
    params.mode === "form"
      ? mcpFormQuestions(params)
      : [
          {
            custom: true,
            header: params.serverName,
            multiple: false,
            options: [],
            question:
              params.mode === "url" ? `Open ${params.url}` : params.message,
          },
        ];
  return {
    interaction: {
      id: String(request.id),
      kind: "question",
      native: request,
      questions,
      sessionId: codexSessionId(params.threadId),
    },
    request,
  };
};

export const projectCodexInteraction = (
  request: CodexServerRequest
): PendingCodexInteraction | undefined => {
  if (request.method === "item/commandExecution/requestApproval") {
    return projectCommandPermission(
      request,
      request.params as CommandExecutionRequestApprovalParams
    );
  }
  if (request.method === "item/fileChange/requestApproval") {
    return projectFilePermission(
      request,
      request.params as FileChangeRequestApprovalParams
    );
  }
  if (request.method === "item/permissions/requestApproval") {
    return projectProfilePermission(
      request,
      request.params as PermissionsRequestApprovalParams
    );
  }
  if (request.method === "item/tool/requestUserInput") {
    return projectQuestion(
      request,
      request.params as ToolRequestUserInputParams
    );
  }
  if (request.method === "mcpServer/elicitation/request") {
    return projectMcpQuestion(
      request,
      request.params as McpServerElicitationRequestParams
    );
  }
};

export const permissionResponse = (
  pending: PendingCodexInteraction,
  decision: PermissionDecision
): unknown => {
  const modernDecision = () => {
    if (decision === "reject") {
      return "decline";
    }
    if (decision === "always") {
      return "acceptForSession";
    }
    return "accept";
  };
  const legacyDecision = () => {
    if (decision === "reject") {
      return "denied";
    }
    if (decision === "always") {
      return "approved_for_session";
    }
    return "approved";
  };
  if (pending.request.method === "item/commandExecution/requestApproval") {
    return { decision: modernDecision() };
  }
  if (pending.request.method === "item/fileChange/requestApproval") {
    return { decision: modernDecision() };
  }
  if (pending.request.method === "item/permissions/requestApproval") {
    const params = pending.request.params as PermissionsRequestApprovalParams;
    return {
      permissions:
        decision === "reject"
          ? {}
          : {
              ...(params.permissions.fileSystem
                ? { fileSystem: params.permissions.fileSystem }
                : {}),
              ...(params.permissions.network
                ? { network: params.permissions.network }
                : {}),
            },
      scope: decision === "always" ? "session" : "turn",
    };
  }
  if (
    pending.request.method === "applyPatchApproval" ||
    pending.request.method === "execCommandApproval"
  ) {
    return { decision: legacyDecision() };
  }
  throw new Error(
    `Unsupported Codex permission request: ${pending.request.method}`
  );
};

const coerceMcpAnswer = (
  schema: McpElicitationPrimitiveSchema,
  answers: readonly string[]
): unknown => {
  if (schema.type === "array") {
    return [...answers];
  }
  const answer = answers[0] ?? "";
  if (schema.type === "boolean") {
    return answer.toLowerCase() === "true";
  }
  if (schema.type === "number" || schema.type === "integer") {
    return Number(answer);
  }
  return answer;
};

export const questionResponse = (
  pending: PendingCodexInteraction,
  input: RespondQuestionInput
): unknown => {
  if (pending.request.method === "item/tool/requestUserInput") {
    const params = pending.request.params as ToolRequestUserInputParams;
    if (input.action === "reject") {
      return { answers: {} };
    }
    return {
      answers: Object.fromEntries(
        params.questions.map((question, index) => [
          question.id,
          { answers: [...(input.answers[index] ?? [])] },
        ])
      ),
    };
  }
  if (pending.request.method === "mcpServer/elicitation/request") {
    const params = pending.request.params as McpServerElicitationRequestParams;
    if (input.action === "reject") {
      return { _meta: null, action: "decline", content: null };
    }
    if (params.mode !== "form") {
      return {
        _meta: null,
        action: "accept",
        content: { response: input.answers[0]?.[0] ?? "" },
      };
    }
    return {
      _meta: null,
      action: "accept",
      content: Object.fromEntries(
        Object.entries(params.requestedSchema.properties).flatMap(
          ([name, schema], index) =>
            schema
              ? [[name, coerceMcpAnswer(schema, input.answers[index] ?? [])]]
              : []
        )
      ),
    };
  }
  throw new Error(
    `Unsupported Codex question request: ${pending.request.method}`
  );
};
