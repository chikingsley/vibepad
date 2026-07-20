import { z } from "zod";

export const permissionDecisionSchema = z.enum(["always", "once", "reject"]);
export type PermissionDecision = z.infer<typeof permissionDecisionSchema>;

export const permissionRequestSchema = z.object({
  action: z.string().min(1),
  id: z.string().min(1),
  kind: z.literal("permission"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  native: z.unknown(),
  resources: z.array(z.string()),
  save: z.array(z.string()),
  sessionId: z.string().min(1),
});
export type PermissionRequest = Readonly<
  z.infer<typeof permissionRequestSchema>
>;

export const questionOptionSchema = z.object({
  description: z.string(),
  label: z.string().min(1),
});
export type QuestionOption = Readonly<z.infer<typeof questionOptionSchema>>;

export const questionInfoSchema = z.object({
  custom: z.boolean(),
  header: z.string().min(1),
  multiple: z.boolean(),
  options: z.array(questionOptionSchema),
  question: z.string().min(1),
});
export type QuestionInfo = Readonly<z.infer<typeof questionInfoSchema>>;

export const questionRequestSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("question"),
  native: z.unknown(),
  questions: z.array(questionInfoSchema).min(1),
  sessionId: z.string().min(1),
});
export type QuestionRequest = Readonly<z.infer<typeof questionRequestSchema>>;

export const pendingInteractionSchema = z.discriminatedUnion("kind", [
  permissionRequestSchema,
  questionRequestSchema,
]);
export type PendingInteraction = Readonly<
  z.infer<typeof pendingInteractionSchema>
>;

export interface RespondPermissionInput {
  readonly decision: PermissionDecision;
  readonly message?: string;
  readonly requestId: string;
  readonly sessionId: string;
}

export type RespondQuestionInput = Readonly<
  | {
      readonly action: "answer";
      readonly answers: readonly (readonly string[])[];
      readonly requestId: string;
      readonly sessionId: string;
    }
  | {
      readonly action: "reject";
      readonly requestId: string;
      readonly sessionId: string;
    }
>;
