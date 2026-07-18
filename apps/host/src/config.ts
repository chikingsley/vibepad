import { z } from "zod";

const hostConfigSchema = z.object({
  hostname: z.string().min(1),
  openCodeBaseUrl: z.url(),
  port: z.number().int().min(0).max(65_535),
});

export const loadHostConfig = () => {
  const { OPENCODE_BASE_URL, VIBEPAD_HOSTNAME, VIBEPAD_PORT } = process.env;

  return hostConfigSchema.parse({
    hostname: VIBEPAD_HOSTNAME ?? "127.0.0.1",
    openCodeBaseUrl: OPENCODE_BASE_URL ?? "http://127.0.0.1:4096",
    port: Number(VIBEPAD_PORT ?? "4100"),
  });
};
