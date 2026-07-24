import type {
  ClaudeCanUseTool,
  ClaudeCodeSdk,
  ClaudePermissionMode,
  ClaudeQueryHandle,
  ClaudeQueryOptions,
  ClaudeSettingSource,
  ClaudeUserMessageInput,
} from "./sdk";

const endedQueues = new WeakSet<AsyncMessageQueue<unknown>>();
const busyRuntimes = new WeakSet<ClaudeCodeSessionRuntime>();
const disposedRuntimes = new WeakSet<ClaudeCodeSessionRuntime>();

/** Streaming input queue for the SDK's multi-turn prompt iterable. */
export class AsyncMessageQueue<T> implements AsyncIterable<T> {
  readonly #queue: T[] = [];
  #wake: (() => void) | undefined;

  end(): void {
    endedQueues.add(this as AsyncMessageQueue<unknown>);
    this.#wake?.();
    this.#wake = undefined;
  }

  push(item: T): void {
    if (endedQueues.has(this as AsyncMessageQueue<unknown>)) {
      return;
    }
    this.#queue.push(item);
    this.#wake?.();
    this.#wake = undefined;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (;;) {
      const item = this.#queue.shift();
      if (item !== undefined) {
        yield item;
        continue;
      }
      if (endedQueues.has(this as AsyncMessageQueue<unknown>)) {
        return;
      }
      // biome-ignore lint/performance/noAwaitInLoops: The consumer must wait for the next pushed message.
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
  }
}

export interface ClaudeCodeRuntimeOptions {
  readonly canUseTool: ClaudeCanUseTool;
  readonly cwd: string;
  readonly model?: string;
  readonly nativeSessionId: string;
  readonly onError: (error: unknown) => void;
  readonly onExit: () => void;
  readonly onMessage: (message: unknown) => void;
  readonly pathToClaudeCodeExecutable?: string;
  readonly permissionMode?: ClaudePermissionMode;
  readonly resume: boolean;
  readonly sdk: Pick<ClaudeCodeSdk, "query">;
  readonly settingSources?: readonly ClaudeSettingSource[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * One live Agent SDK query per VibePad session. The host owns the process:
 * a runtime is started lazily on the first turn (new sessions launch with a
 * pre-assigned session id, existing ones resume by id) and stays attached
 * for follow-up turns until it errors, is interrupted away, or is disposed.
 */
export class ClaudeCodeSessionRuntime {
  readonly #handle: ClaudeQueryHandle;
  readonly #options: ClaudeCodeRuntimeOptions;
  readonly #queue = new AsyncMessageQueue<ClaudeUserMessageInput>();

  constructor(options: ClaudeCodeRuntimeOptions) {
    this.#options = options;
    const queryOptions: ClaudeQueryOptions = {
      canUseTool: options.canUseTool,
      cwd: options.cwd,
      ...(options.model ? { model: options.model } : {}),
      ...(options.pathToClaudeCodeExecutable
        ? { pathToClaudeCodeExecutable: options.pathToClaudeCodeExecutable }
        : {}),
      ...(options.permissionMode
        ? { permissionMode: options.permissionMode }
        : {}),
      ...(options.permissionMode === "bypassPermissions"
        ? { allowDangerouslySkipPermissions: true }
        : {}),
      ...(options.resume
        ? { resume: options.nativeSessionId }
        : { sessionId: options.nativeSessionId }),
      ...(options.settingSources
        ? { settingSources: options.settingSources }
        : {}),
    };
    this.#handle = options.sdk.query({
      options: queryOptions,
      prompt: this.#queue,
    });
    this.#pump().catch((error: unknown) => {
      this.#options.onError(error);
    });
  }

  get busy(): boolean {
    return busyRuntimes.has(this);
  }

  send(text: string): void {
    if (disposedRuntimes.has(this)) {
      throw new Error("Claude Code session runtime is disposed");
    }
    busyRuntimes.add(this);
    this.#queue.push({
      message: { content: text, role: "user" },
      parent_tool_use_id: null,
      session_id: this.#options.nativeSessionId,
      type: "user",
    });
  }

  async interrupt(): Promise<void> {
    await this.#handle.interrupt();
    busyRuntimes.delete(this);
  }

  async setModel(model: string): Promise<void> {
    await this.#handle.setModel?.(model);
  }

  async setPermissionMode(mode: ClaudePermissionMode): Promise<void> {
    await this.#handle.setPermissionMode?.(mode);
  }

  dispose(): void {
    if (disposedRuntimes.has(this)) {
      return;
    }
    disposedRuntimes.add(this);
    busyRuntimes.delete(this);
    this.#queue.end();
    this.#handle.close?.();
  }

  async #pump(): Promise<void> {
    try {
      for await (const message of this.#handle) {
        if (isRecord(message) && Reflect.get(message, "type") === "result") {
          busyRuntimes.delete(this);
        }
        this.#options.onMessage(message);
      }
    } finally {
      busyRuntimes.delete(this);
      disposedRuntimes.add(this);
      this.#queue.end();
      this.#options.onExit();
    }
  }
}
