import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";

const defaultCodexProjectRoot = resolve(import.meta.dir, "../../..");
const { XDG_STATE_HOME } = process.env;
const defaultStateDirectory =
  platform() === "darwin"
    ? join(homedir(), "Library", "Application Support", "VibePad")
    : join(XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "vibepad");

const hostConfigSchema = z.object({
  agentBrowserExecutable: z.string().min(1).optional(),
  browserCdpUrl: z.url().optional(),
  browserEnabled: z.boolean(),
  browserSurfaceUrl: z.url().optional(),
  codexEnabled: z.boolean(),
  codexExecutable: z.string().min(1),
  codexProjectRoots: z.array(z.string().min(1)),
  hostAuthDatabase: z.string().min(1),
  hostId: z.string().regex(/^[A-Za-z0-9._-]+$/u),
  hostName: z.string().min(1),
  hostname: z.string().min(1),
  openCodeBaseUrl: z.url(),
  openCodeEnabled: z.boolean(),
  openCodeExecutable: z.string().min(1),
  openCodeManaged: z.boolean(),
  openCodePassword: z.string().min(1).optional(),
  openCodeUsername: z.string().min(1),
  port: z.number().int().min(0).max(65_535),
  providerEventDatabase: z.string().min(1),
  providerSessionDatabase: z.string().min(1),
  voiceApiKey: z.string().min(1).optional(),
  voiceBaseUrl: z.url(),
});

export const loadHostConfig = () => {
  const {
    AGENT_BROWSER_BIN,
    CODEX_BIN,
    OPENCODE_BASE_URL,
    OPENCODE_BIN,
    OPENCODE_SERVER_PASSWORD,
    OPENCODE_SERVER_USERNAME,
    VIBEPAD_CODEX_ENABLED,
    VIBEPAD_BROWSER_CDP_URL,
    VIBEPAD_BROWSER_ENABLED,
    VIBEPAD_BROWSER_SURFACE_URL,
    VIBEPAD_CODEX_PROJECT_ROOTS,
    VIBEPAD_HOST_ID,
    VIBEPAD_HOST_NAME,
    VIBEPAD_HOSTNAME,
    VIBEPAD_OPENCODE_ENABLED,
    VIBEPAD_OPENCODE_MANAGED,
    VIBEPAD_PORT,
    VIBEPAD_STATE_DIR,
    PEACOCKERY_VOICE_API_KEY,
    PEACOCKERY_VOICE_BASE_URL,
  } = process.env;

  return hostConfigSchema.parse({
    agentBrowserExecutable: AGENT_BROWSER_BIN,
    browserCdpUrl: VIBEPAD_BROWSER_CDP_URL,
    browserEnabled: VIBEPAD_BROWSER_ENABLED === "1",
    browserSurfaceUrl: VIBEPAD_BROWSER_SURFACE_URL,
    codexEnabled: VIBEPAD_CODEX_ENABLED !== "0",
    codexExecutable: CODEX_BIN ?? "codex",
    codexProjectRoots: (VIBEPAD_CODEX_PROJECT_ROOTS ?? defaultCodexProjectRoot)
      .split(",")
      .map((path) => path.trim())
      .filter(Boolean),
    hostAuthDatabase: join(
      VIBEPAD_STATE_DIR ?? defaultStateDirectory,
      "host-auth.sqlite"
    ),
    hostId: VIBEPAD_HOST_ID ?? VIBEPAD_HOST_NAME ?? "home-mac",
    hostName: VIBEPAD_HOST_NAME ?? "home-mac",
    hostname: VIBEPAD_HOSTNAME ?? "127.0.0.1",
    openCodeBaseUrl: OPENCODE_BASE_URL ?? "http://127.0.0.1:4096",
    openCodeEnabled: VIBEPAD_OPENCODE_ENABLED !== "0",
    openCodeExecutable: OPENCODE_BIN ?? "opencode",
    openCodeManaged: VIBEPAD_OPENCODE_MANAGED === "1",
    openCodePassword: OPENCODE_SERVER_PASSWORD,
    openCodeUsername: OPENCODE_SERVER_USERNAME ?? "opencode",
    port: Number(VIBEPAD_PORT ?? "4100"),
    providerEventDatabase: join(
      VIBEPAD_STATE_DIR ?? defaultStateDirectory,
      "provider-events.sqlite"
    ),
    providerSessionDatabase: join(
      VIBEPAD_STATE_DIR ?? defaultStateDirectory,
      "provider-sessions.sqlite"
    ),
    voiceApiKey: PEACOCKERY_VOICE_API_KEY,
    voiceBaseUrl:
      PEACOCKERY_VOICE_BASE_URL ?? "https://voice-lab.peacockery.studio",
  });
};
