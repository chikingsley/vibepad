import type { HarnessAdapter } from "@vibepad/protocol/provider";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const projectSessionsPath = /^\/v1\/projects\/([^/]+)\/sessions$/;

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    headers: corsHeaders,
    status,
  });

export const createRequestHandler =
  (adapter: HarnessAdapter) => async (request: Request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/health") {
        return json({
          host: { healthy: true },
          provider: await adapter.health(),
        });
      }

      if (url.pathname === "/v1/providers") {
        return json({ data: [adapter.manifest] });
      }

      if (url.pathname === "/v1/projects") {
        return json({ data: await adapter.listProjects() });
      }

      const sessionMatch = projectSessionsPath.exec(url.pathname);
      const projectId = sessionMatch?.[1];
      if (projectId) {
        return json({
          data: await adapter.listSessions(decodeURIComponent(projectId)),
        });
      }

      return json({ error: "not_found" }, 404);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown host error";
      return json({ error: "upstream_unavailable", message }, 503);
    }
  };
