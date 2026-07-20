import { z } from "zod";

export const workspaceFileNodeSchema = z.object({
  ignored: z.boolean(),
  name: z.string().min(1),
  path: z.string().min(1),
  type: z.enum(["directory", "file"]),
});
export type WorkspaceFileNode = Readonly<
  z.infer<typeof workspaceFileNodeSchema>
>;

export const workspaceFileContentSchema = z.object({
  content: z.string(),
  diff: z.string().optional(),
  encoding: z.literal("base64").optional(),
  mimeType: z.string().min(1).optional(),
  type: z.enum(["binary", "text"]),
});
export type WorkspaceFileContent = Readonly<
  z.infer<typeof workspaceFileContentSchema>
>;

export const workspaceFileChangeSchema = z.object({
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  patch: z.string().optional(),
  path: z.string().min(1),
  status: z.enum(["added", "deleted", "modified"]),
});
export type WorkspaceFileChange = Readonly<
  z.infer<typeof workspaceFileChangeSchema>
>;
