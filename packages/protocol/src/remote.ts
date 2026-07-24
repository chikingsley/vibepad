import { z } from "zod";
import { pairingInvitationSchema } from "./auth";

export const sshTargetSchema = z
  .object({
    alias: z.string().min(1),
    hostName: z.string().min(1),
    port: z.number().int().min(1).max(65_535),
    source: z.literal("ssh-config"),
    user: z.string().min(1),
  })
  .strict();

export type SshTarget = Readonly<z.infer<typeof sshTargetSchema>>;

export const sshTargetListResponseSchema = z
  .object({ data: z.array(sshTargetSchema) })
  .strict();

export const sshTargetsPath = "/v1/remote/ssh-targets";

export const sshBootstrapRequestSchema = z
  .object({ alias: z.string().min(1).max(255) })
  .strict();

export type SshBootstrapRequest = Readonly<
  z.infer<typeof sshBootstrapRequestSchema>
>;

export const sshBootstrapResponseSchema = z
  .object({ data: pairingInvitationSchema })
  .strict();

export const sshBootstrapPath = "/v1/remote/ssh-bootstrap";
