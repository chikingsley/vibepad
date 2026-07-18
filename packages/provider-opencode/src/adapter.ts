import {
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk/v2/client";
import type { SessionV2Info } from "@opencode-ai/sdk/v2/types";
import type { ProviderEvent } from "@vibepad/protocol/events";
import type {
  CreateSessionInput,
  HarnessAdapter,
  ProjectSummary,
  SendTurnInput,
  SessionSummary,
} from "@vibepad/protocol/provider";

import { openCodeManifest } from "./manifest";

const mapSession = (session: SessionV2Info): SessionSummary => ({
  id: session.id,
  native: session,
  projectId: session.projectID,
  title: session.title,
  updatedAt: new Date(session.time.updated).toISOString(),
});

export class OpenCodeAdapter implements HarnessAdapter {
  readonly manifest = openCodeManifest;
  readonly #client: OpencodeClient;
  readonly #projectPaths = new Map<string, string>();

  constructor(baseUrl: string) {
    this.#client = createOpencodeClient({ baseUrl });
  }

  async health() {
    const result = await this.#client.v2.health.get({ throwOnError: true });
    return result.data;
  }

  async listProjects(): Promise<readonly ProjectSummary[]> {
    const result = await this.#client.project.list({}, { throwOnError: true });

    return result.data.map((project) => {
      this.#projectPaths.set(project.id, project.worktree);
      return {
        id: project.id,
        name: project.name ?? project.worktree.split("/").at(-1) ?? project.id,
        native: project,
        path: project.worktree,
      };
    });
  }

  async listSessions(projectId: string): Promise<readonly SessionSummary[]> {
    const result = await this.#client.v2.session.list(
      { order: "desc", project: projectId },
      { throwOnError: true }
    );
    return result.data.data.map(mapSession);
  }

  async createSession(input: CreateSessionInput): Promise<SessionSummary> {
    const directory = await this.#resolveProjectPath(input.projectId);
    const result = await this.#client.v2.session.create(
      { location: { directory } },
      { throwOnError: true }
    );
    return mapSession(result.data.data);
  }

  async sendTurn(input: SendTurnInput): Promise<void> {
    await this.#client.v2.session.prompt(
      {
        delivery: "steer",
        prompt: { text: input.text },
        sessionID: input.sessionId,
      },
      { throwOnError: true }
    );
  }

  async abortTurn(sessionId: string): Promise<void> {
    await this.#client.v2.session.interrupt(
      { sessionID: sessionId },
      { throwOnError: true }
    );
  }

  async *subscribe(sessionId: string): AsyncIterable<ProviderEvent> {
    const session = await this.#client.v2.session.get(
      { sessionID: sessionId },
      { throwOnError: true }
    );
    const events = await this.#client.v2.session.events({
      sessionID: sessionId,
    });

    let fallbackSequence = 0;
    for await (const event of events.stream) {
      fallbackSequence += 1;
      const sequence = Number.parseInt(event.id, 10);
      yield {
        eventId: event.id,
        kind: "provider.event",
        native: parseNativeEvent(event.data),
        projectId: session.data.data.projectID,
        providerId: this.manifest.id,
        sequence: Number.isSafeInteger(sequence) ? sequence : fallbackSequence,
        sessionId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async #resolveProjectPath(projectId: string): Promise<string> {
    const cached = this.#projectPaths.get(projectId);
    if (cached) {
      return cached;
    }

    const projects = await this.listProjects();
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error(`OpenCode project not found: ${projectId}`);
    }
    return project.path;
  }
}

const parseNativeEvent = (data: string): unknown => {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
};
