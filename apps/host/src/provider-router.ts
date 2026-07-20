import type { ProviderManifest } from "@vibepad/protocol/capabilities";
import type { ProviderCatalog } from "@vibepad/protocol/catalog";
import type { ProviderEvent } from "@vibepad/protocol/events";
import type {
  WorkspaceFileChange,
  WorkspaceFileContent,
  WorkspaceFileNode,
} from "@vibepad/protocol/files";
import type {
  PendingInteraction,
  RespondPermissionInput,
  RespondQuestionInput,
} from "@vibepad/protocol/interactions";
import type {
  ArchiveSessionInput,
  CreateSessionInput,
  HarnessAdapter,
  ListFilesInput,
  ProjectSummary,
  ReadFileInput,
  RenameSessionInput,
  SelectAgentInput,
  SelectModelInput,
  SendTurnInput,
  ServiceSummary,
  SessionBootstrap,
  SessionSummary,
} from "@vibepad/protocol/provider";
import type { TimelinePage } from "@vibepad/protocol/timeline";

export interface ProviderHealth {
  readonly healthy: boolean;
  readonly id: string;
  readonly version?: string;
}

interface DisposableAdapter extends HarnessAdapter {
  readonly dispose?: () => Promise<void>;
}

export class ProviderRouter implements HarnessAdapter {
  readonly #adapters: readonly DisposableAdapter[];
  readonly #adapterById: ReadonlyMap<string, DisposableAdapter>;
  readonly #projectOwners = new Map<string, DisposableAdapter>();
  readonly #sessionOwners = new Map<string, DisposableAdapter>();

  constructor(adapters: readonly DisposableAdapter[]) {
    if (adapters.length === 0) {
      throw new Error("ProviderRouter requires at least one adapter");
    }
    this.#adapters = adapters;
    this.#adapterById = new Map(
      adapters.map((adapter) => [adapter.manifest.id, adapter])
    );
  }

  get manifests(): readonly ProviderManifest[] {
    return this.#adapters.map((adapter) => adapter.manifest);
  }

  get manifest(): ProviderManifest {
    const [first] = this.#adapters;
    if (!first) {
      throw new Error("ProviderRouter has no adapters");
    }
    return first.manifest;
  }

  providerHealth(): Promise<readonly ProviderHealth[]> {
    return Promise.all(
      this.#adapters.map(async (adapter) => {
        try {
          return { id: adapter.manifest.id, ...(await adapter.health()) };
        } catch (error) {
          return {
            healthy: false,
            id: adapter.manifest.id,
            version: error instanceof Error ? error.message : "Unavailable",
          };
        }
      })
    );
  }

  async health() {
    const providers = await this.providerHealth();
    return {
      healthy: providers.some((provider) => provider.healthy),
      version: providers
        .map((provider) => `${provider.id}:${provider.version ?? "unknown"}`)
        .join(", "),
    };
  }

  async dispose(): Promise<void> {
    await Promise.all(
      this.#adapters.map((adapter) => adapter.dispose?.() ?? Promise.resolve())
    );
  }

  async listProjects(): Promise<readonly ProjectSummary[]> {
    const settled = await Promise.allSettled(
      this.#adapters.map((adapter) => adapter.listProjects())
    );
    return settled.flatMap((result, index) => {
      if (result.status !== "fulfilled") {
        return [];
      }
      const adapter = this.#adapters[index];
      if (!adapter) {
        return [];
      }
      for (const project of result.value) {
        this.#projectOwners.set(project.id, adapter);
      }
      return result.value;
    });
  }

  async listSessions(projectId?: string): Promise<readonly SessionSummary[]> {
    if (projectId) {
      const adapter = await this.#projectAdapter(projectId);
      const sessions = await adapter.listSessions(projectId);
      this.#rememberSessions(adapter, sessions);
      return sessions;
    }
    const settled = await Promise.allSettled(
      this.#adapters.map((adapter) => adapter.listSessions())
    );
    return settled.flatMap((result, index) => {
      if (result.status !== "fulfilled") {
        return [];
      }
      const adapter = this.#adapters[index];
      if (!adapter) {
        return [];
      }
      this.#rememberSessions(adapter, result.value);
      return result.value;
    });
  }

  async createSession(input: CreateSessionInput): Promise<SessionSummary> {
    const adapter = await this.#projectAdapter(input.projectId);
    const session = await adapter.createSession(input);
    this.#sessionOwners.set(session.id, adapter);
    return session;
  }

  async archiveSession(input: ArchiveSessionInput): Promise<void> {
    return (await this.#sessionAdapter(input.sessionId)).archiveSession(input);
  }

  async bootstrapSession(sessionId: string): Promise<SessionBootstrap> {
    return (await this.#sessionAdapter(sessionId)).bootstrapSession(sessionId);
  }

  async renameSession(input: RenameSessionInput): Promise<SessionSummary> {
    return (await this.#sessionAdapter(input.sessionId)).renameSession(input);
  }

  async sendTurn(input: SendTurnInput): Promise<void> {
    return (await this.#sessionAdapter(input.sessionId)).sendTurn(input);
  }

  async abortTurn(sessionId: string): Promise<void> {
    return (await this.#sessionAdapter(sessionId)).abortTurn(sessionId);
  }

  async listTimeline(
    sessionId: string,
    olderCursor?: string
  ): Promise<TimelinePage> {
    return (await this.#sessionAdapter(sessionId)).listTimeline(
      sessionId,
      olderCursor
    );
  }

  async listCatalog(projectId: string): Promise<ProviderCatalog> {
    return (await this.#projectAdapter(projectId)).listCatalog(projectId);
  }

  async selectModel(input: SelectModelInput): Promise<SessionSummary> {
    return (await this.#sessionAdapter(input.sessionId)).selectModel(input);
  }

  async selectAgent(input: SelectAgentInput): Promise<SessionSummary> {
    return (await this.#sessionAdapter(input.sessionId)).selectAgent(input);
  }

  async listInteractions(
    sessionId: string
  ): Promise<readonly PendingInteraction[]> {
    return (await this.#sessionAdapter(sessionId)).listInteractions(sessionId);
  }

  async respondPermission(input: RespondPermissionInput): Promise<void> {
    return (await this.#sessionAdapter(input.sessionId)).respondPermission(
      input
    );
  }

  async respondQuestion(input: RespondQuestionInput): Promise<void> {
    return (await this.#sessionAdapter(input.sessionId)).respondQuestion(input);
  }

  async listFiles(
    input: ListFilesInput
  ): Promise<readonly WorkspaceFileNode[]> {
    return (await this.#projectAdapter(input.projectId)).listFiles(input);
  }

  async readFile(input: ReadFileInput): Promise<WorkspaceFileContent> {
    return (await this.#projectAdapter(input.projectId)).readFile(input);
  }

  async listFileChanges(
    projectId: string
  ): Promise<readonly WorkspaceFileChange[]> {
    return (await this.#projectAdapter(projectId)).listFileChanges(projectId);
  }

  async listServices(projectId: string): Promise<readonly ServiceSummary[]> {
    return (await this.#projectAdapter(projectId)).listServices(projectId);
  }

  async *subscribe(
    sessionId: string,
    signal?: AbortSignal,
    afterCursor?: string
  ): AsyncIterable<ProviderEvent> {
    yield* (await this.#sessionAdapter(sessionId)).subscribe(
      sessionId,
      signal,
      afterCursor
    );
  }

  async #projectAdapter(projectId: string): Promise<DisposableAdapter> {
    const qualified = this.#qualifiedAdapter(projectId);
    if (qualified) {
      return qualified;
    }
    const cached = this.#projectOwners.get(projectId);
    if (cached) {
      return cached;
    }
    await this.listProjects();
    const discovered = this.#projectOwners.get(projectId);
    if (!discovered) {
      throw new Error(`Provider project not found: ${projectId}`);
    }
    return discovered;
  }

  async #sessionAdapter(sessionId: string): Promise<DisposableAdapter> {
    const qualified = this.#qualifiedAdapter(sessionId);
    if (qualified) {
      return qualified;
    }
    const cached = this.#sessionOwners.get(sessionId);
    if (cached) {
      return cached;
    }
    await this.listSessions();
    const discovered = this.#sessionOwners.get(sessionId);
    if (!discovered) {
      throw new Error(`Provider session not found: ${sessionId}`);
    }
    return discovered;
  }

  #qualifiedAdapter(id: string) {
    const separator = id.indexOf(":");
    if (separator > 0) {
      return this.#adapterById.get(id.slice(0, separator));
    }
    // OpenCode exposed raw `ses_*` identifiers before VibePad adopted
    // provider-qualified IDs. Preserve already-open tabs across that migration
    // while all newly returned IDs remain explicit and restart-safe.
    return id.startsWith("ses_")
      ? this.#adapterById.get("opencode")
      : undefined;
  }

  #rememberSessions(
    adapter: DisposableAdapter,
    sessions: readonly SessionSummary[]
  ) {
    for (const session of sessions) {
      this.#sessionOwners.set(session.id, adapter);
    }
  }
}
