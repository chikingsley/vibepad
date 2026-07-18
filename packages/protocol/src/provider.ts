import type { ProviderManifest } from "./capabilities";
import type { ProviderEvent } from "./events";

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly native: unknown;
  readonly path: string;
}

export interface SessionSummary {
  readonly id: string;
  readonly native: unknown;
  readonly projectId: string;
  readonly title: string;
  readonly updatedAt?: string;
}

export interface CreateSessionInput {
  readonly projectId: string;
}

export interface SendTurnInput {
  readonly sessionId: string;
  readonly text: string;
}

export interface HarnessAdapter {
  readonly abortTurn: (sessionId: string) => Promise<void>;
  readonly createSession: (
    input: CreateSessionInput
  ) => Promise<SessionSummary>;
  readonly health: () => Promise<{ readonly healthy: true }>;
  readonly listProjects: () => Promise<readonly ProjectSummary[]>;
  readonly listSessions: (
    projectId: string
  ) => Promise<readonly SessionSummary[]>;
  readonly manifest: ProviderManifest;
  readonly sendTurn: (input: SendTurnInput) => Promise<void>;
  readonly subscribe: (sessionId: string) => AsyncIterable<ProviderEvent>;
}
