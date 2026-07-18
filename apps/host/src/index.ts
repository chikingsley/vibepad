import { OpenCodeAdapter } from "@vibepad/provider-opencode/adapter";
import { serve } from "bun";

import { loadHostConfig } from "./config";
import { createRequestHandler } from "./http";

const config = loadHostConfig();
const adapter = new OpenCodeAdapter(config.openCodeBaseUrl);
const server = serve({
  fetch: createRequestHandler(adapter),
  hostname: config.hostname,
  port: config.port,
});

console.info(`VibePad host listening at ${server.url}`);
