import { z } from "zod";

export const browserPath = "/v1/browser";
export const browserTargetsPath = "/v1/browser/targets";
export const browserViewSessionsPath = "/v1/browser/view-sessions";
export const browserViewPathPrefix = "/v1/browser/view";
export const browserSocketPathPrefix = "/v1/browser/socket";

export const browserTargetSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    url: z.string().min(1),
  })
  .strict();

export type BrowserTarget = z.infer<typeof browserTargetSchema>;

export const browserStateSchema = z
  .object({
    activeTargetId: z.string().min(1).optional(),
    available: z.boolean(),
    canGoBack: z.boolean(),
    canGoForward: z.boolean(),
    healthy: z.boolean(),
    targets: z.array(browserTargetSchema),
  })
  .strict();

export type BrowserState = z.infer<typeof browserStateSchema>;

export const browserStateResponseSchema = z
  .object({ data: browserStateSchema })
  .strict();

export const createBrowserTargetRequestSchema = z
  .object({ url: z.url() })
  .strict();

export type CreateBrowserTargetRequest = z.infer<
  typeof createBrowserTargetRequestSchema
>;

export const browserTargetResponseSchema = z
  .object({ data: browserTargetSchema })
  .strict();

export const browserTargetActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate") }).strict(),
  z.object({ action: z.literal("back") }).strict(),
  z.object({ action: z.literal("forward") }).strict(),
  z.object({ action: z.literal("reload") }).strict(),
  z.object({ action: z.literal("navigate"), url: z.url() }).strict(),
]);

export type BrowserTargetActionRequest = z.infer<
  typeof browserTargetActionRequestSchema
>;

export const browserTargetActionResponseSchema = z
  .object({ accepted: z.literal(true) })
  .strict();

export const closeBrowserTargetResponseSchema = z
  .object({ closed: z.literal(true) })
  .strict();

export const browserViewSessionSchema = z
  .object({
    expiresAt: z.iso.datetime(),
    path: z.string().startsWith(`${browserViewPathPrefix}/`),
  })
  .strict();

export type BrowserViewSession = z.infer<typeof browserViewSessionSchema>;

export const browserViewSessionResponseSchema = z
  .object({ data: browserViewSessionSchema })
  .strict();

export const browserTargetPath = (targetId: string) =>
  `${browserTargetsPath}/${encodeURIComponent(targetId)}`;

export const browserTargetActionPath = (targetId: string) =>
  `${browserTargetPath(targetId)}/actions`;
