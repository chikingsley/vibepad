import { z } from "zod";

export const capabilityIds = [
  "project.list",
  "session.list",
  "session.create",
  "session.archive",
  "session.rename",
  "session.resume",
  "session.children",
  "session.share",
  "turn.send",
  "turn.cancel",
  "turn.revert",
  "timeline.stream",
  "model.select",
  "permission.respond",
  "question.respond",
  "file.read",
  "file.search",
  "file.status",
  "command.run",
  "shell.run",
] as const;

export const capabilityIdSchema = z.enum(capabilityIds);
export type CapabilityId = z.infer<typeof capabilityIdSchema>;

const supportDetailSchema = z.object({
  note: z.string().min(1).optional(),
});

export const capabilitySupportSchema = z.discriminatedUnion("state", [
  supportDetailSchema.extend({ state: z.literal("supported") }),
  supportDetailSchema.extend({ state: z.literal("conditional") }),
  supportDetailSchema.extend({ state: z.literal("unsupported") }),
]);
export type CapabilitySupport = z.infer<typeof capabilitySupportSchema>;

export const providerControlSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["action", "select", "toggle"]),
  label: z.string().min(1),
  scope: z.enum(["host", "project", "session", "turn"]),
});
export type ProviderControl = z.infer<typeof providerControlSchema>;

export const providerManifestSchema = z.object({
  capabilities: z.record(capabilityIdSchema, capabilitySupportSchema),
  controls: z.array(providerControlSchema),
  displayName: z.string().min(1),
  id: z.string().min(1),
  protocolVersion: z.literal(1),
});
export type ProviderManifest = z.infer<typeof providerManifestSchema>;
