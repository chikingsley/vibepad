import { z } from "zod";

export const modelReferenceSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  variant: z.string().min(1).optional(),
});
export type ModelReference = Readonly<z.infer<typeof modelReferenceSchema>>;

export const modelSummarySchema = modelReferenceSchema.extend({
  enabled: z.boolean(),
  name: z.string().min(1),
  native: z.unknown(),
  status: z.enum(["active", "alpha", "beta", "deprecated"]),
  variants: z.array(z.string().min(1)),
});
export type ModelSummary = Readonly<z.infer<typeof modelSummarySchema>>;

export const modelProviderSummarySchema = z.object({
  disabled: z.boolean(),
  id: z.string().min(1),
  name: z.string().min(1),
  native: z.unknown(),
});
export type ModelProviderSummary = Readonly<
  z.infer<typeof modelProviderSummarySchema>
>;

export const agentSummarySchema = z.object({
  description: z.string().optional(),
  hidden: z.boolean(),
  id: z.string().min(1),
  mode: z.enum(["all", "primary", "subagent"]),
  model: modelReferenceSchema.optional(),
  native: z.unknown(),
});
export type AgentSummary = Readonly<z.infer<typeof agentSummarySchema>>;

export const commandSummarySchema = z.object({
  description: z.string().optional(),
  name: z.string().min(1),
  native: z.unknown(),
  subtask: z.boolean(),
});
export type CommandSummary = Readonly<z.infer<typeof commandSummarySchema>>;

export const skillSummarySchema = z.object({
  description: z.string().optional(),
  location: z.string().min(1),
  name: z.string().min(1),
  native: z.unknown(),
});
export type SkillSummary = Readonly<z.infer<typeof skillSummarySchema>>;

export const providerCatalogSchema = z.object({
  agents: z.array(agentSummarySchema),
  commands: z.array(commandSummarySchema),
  models: z.array(modelSummarySchema),
  providers: z.array(modelProviderSummarySchema),
  skills: z.array(skillSummarySchema),
});
export type ProviderCatalog = Readonly<z.infer<typeof providerCatalogSchema>>;
