import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

import type { InitializeParams } from "../generated/InitializeParams";
import type { InitializeResponse } from "../generated/InitializeResponse";

export type CodexRequestId = number | string;

export interface CodexServerNotification {
  readonly method: string;
  readonly params: unknown;
}

export interface CodexServerRequest extends CodexServerNotification {
  readonly connectionGeneration: number;
  readonly id: CodexRequestId;
}

export interface CodexAppServerClientOptions {
  readonly command?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<NodeJS.ProcessEnv>;
  readonly requestTimeoutMs?: number;
}

export interface CodexRequestOptions {
  readonly retryOnDisconnect?: boolean;
}

export interface CodexConnectionState {
  readonly error?: Error;
  readonly generation: number;
  readonly kind: "connected" | "disconnected";
}

interface PendingRequest {
  readonly connectionGeneration: number;
  readonly reject: (reason: Error) => void;
  readonly resolve: (value: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface AppServerConnection {
  readonly child: AppServerProcess;
  disconnected: boolean;
  readonly exit: Promise<number>;
  readonly generation: number;
}

interface JsonRpcError {
  readonly code?: number;
  readonly data?: unknown;
  readonly message?: string;
}

type AppServerProcess = ChildProcessWithoutNullStreams;
type ConnectionListener = (state: CodexConnectionState) => void;
type NotificationListener = (notification: CodexServerNotification) => void;
type RequestListener = (request: CodexServerRequest) => void;

const disposedClients = new WeakSet<CodexAppServerClient>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const property = (record: Record<string, unknown>, key: string): unknown =>
  Reflect.get(record, key);

const stringifyError = (error: JsonRpcError) => {
  const detail =
    error.data === undefined ? "" : `: ${JSON.stringify(error.data)}`;
  return `${error.message ?? "Codex app-server request failed"}${detail}`;
};

export class CodexAppServerConnectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CodexAppServerConnectionError";
  }
}

export class CodexNotInstalledError extends CodexAppServerConnectionError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CodexNotInstalledError";
  }
}

const errorCode = (error: unknown) => {
  if (!isRecord(error)) {
    return;
  }
  const code = property(error, "code");
  return typeof code === "string" ? code : undefined;
};

const notInstalledError = (executable: string, cause?: unknown) =>
  new CodexNotInstalledError(
    `Codex CLI is not installed ("${executable}" was not found on PATH). Install Codex CLI 0.130 or newer — for example \`npm install -g @openai/codex\` — and retry.`,
    cause instanceof Error ? { cause } : undefined
  );

type ExecutableVersionProbe =
  | { readonly kind: "missing" }
  | { readonly kind: "unknown" }
  | { readonly kind: "version"; readonly version: string };

const versionProbeTimeoutMs = 2000;

const connectionError = (reason: unknown) => {
  if (reason instanceof CodexAppServerConnectionError) {
    return reason;
  }
  if (reason instanceof Error) {
    return new CodexAppServerConnectionError(reason.message, { cause: reason });
  }
  return new CodexAppServerConnectionError(
    "Codex app-server connection failed"
  );
};

export class CodexAppServerClient {
  readonly #command: readonly string[];
  readonly #connectionListeners = new Set<ConnectionListener>();
  readonly #cwd: string | undefined;
  readonly #env: Readonly<NodeJS.ProcessEnv>;
  readonly #notificationListeners = new Set<NotificationListener>();
  readonly #pending = new Map<string, PendingRequest>();
  readonly #requestListeners = new Set<RequestListener>();
  readonly #requestTimeoutMs: number;
  #connection: AppServerConnection | undefined;
  #generation = 0;
  #initialization:
    | {
        readonly generation: number;
        readonly promise: Promise<InitializeResponse>;
      }
    | undefined;
  #nextId = 1;
  #stderrTail: string[] = [];

  constructor(options: CodexAppServerClientOptions = {}) {
    this.#command = options.command ?? [
      "codex",
      "app-server",
      "--listen",
      "stdio://",
    ];
    this.#cwd = options.cwd;
    this.#env = options.env ?? process.env;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  }

  get stderrTail(): readonly string[] {
    return this.#stderrTail;
  }

  get connectionGeneration(): number | undefined {
    return this.#connection?.generation;
  }

  get processId(): number | undefined {
    return this.#connection?.child.pid;
  }

  onConnectionState(listener: ConnectionListener) {
    this.#connectionListeners.add(listener);
    return () => {
      this.#connectionListeners.delete(listener);
    };
  }

  onNotification(listener: NotificationListener) {
    this.#notificationListeners.add(listener);
    return () => {
      this.#notificationListeners.delete(listener);
    };
  }

  onRequest(listener: RequestListener) {
    this.#requestListeners.add(listener);
    return () => {
      this.#requestListeners.delete(listener);
    };
  }

  start(): Promise<InitializeResponse> {
    if (disposedClients.has(this)) {
      return Promise.reject(new Error("Codex app-server client is disposed"));
    }
    const initialization = this.#initialization;
    if (
      initialization &&
      initialization.generation === this.#connection?.generation
    ) {
      return initialization.promise;
    }
    try {
      const connection = this.#spawnConnection();
      const promise = this.#initialize(connection).catch(
        async (error: unknown) => {
          this.#disconnect(connection, error, true);
          throw await this.#classifyInitializeFailure(error);
        }
      );
      this.#initialization = {
        generation: connection.generation,
        promise,
      };
      return promise;
    } catch (error) {
      return Promise.reject(connectionError(error));
    }
  }

  async request<Result>(
    method: string,
    params: unknown,
    options: CodexRequestOptions = {}
  ): Promise<Result> {
    try {
      return await this.#requestOnce<Result>(method, params);
    } catch (error) {
      if (
        options.retryOnDisconnect &&
        error instanceof CodexAppServerConnectionError
      ) {
        return this.#requestOnce<Result>(method, params);
      }
      throw error;
    }
  }

  respond(
    id: CodexRequestId,
    result: unknown,
    connectionGeneration?: number
  ): Promise<void> {
    const connection = this.#responseConnection(connectionGeneration);
    this.#write(connection, { id, result });
    return Promise.resolve();
  }

  respondError(
    id: CodexRequestId,
    code: number,
    message: string,
    connectionGeneration?: number
  ): Promise<void> {
    const connection = this.#responseConnection(connectionGeneration);
    this.#write(connection, { error: { code, message }, id });
    return Promise.resolve();
  }

  async dispose(): Promise<void> {
    disposedClients.add(this);
    const connection = this.#connection;
    this.#connection = undefined;
    this.#initialization = undefined;
    this.#rejectPending(new Error("Codex app-server client disposed"));
    if (!connection) {
      return;
    }
    connection.disconnected = true;
    if (connection.child.exitCode === null) {
      connection.child.kill();
    }
    await connection.exit;
  }

  #spawnConnection(): AppServerConnection {
    const [executable, ...arguments_] = this.#command;
    if (!executable) {
      throw new Error("Codex app-server command is empty");
    }
    const child = spawn(executable, arguments_, {
      ...(this.#cwd ? { cwd: this.#cwd } : {}),
      env: this.#env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#generation += 1;
    const connection: AppServerConnection = {
      child,
      disconnected: false,
      exit: new Promise<number>((resolveExit) => {
        child.once("close", (code) => {
          resolveExit(code ?? -1);
        });
      }),
      generation: this.#generation,
    };
    this.#connection = connection;
    this.#consumeStdout(connection).catch((error: unknown) => {
      this.#disconnect(connection, error, true);
    });
    this.#consumeStderr(connection).catch(() => undefined);
    child.once("error", (error) => {
      this.#disconnect(
        connection,
        errorCode(error) === "ENOENT"
          ? notInstalledError(executable, error)
          : error,
        false
      );
    });
    child.stdin.once("error", (error) => {
      this.#disconnect(connection, error, true);
    });
    connection.exit.then((exitCode) => {
      if (!disposedClients.has(this)) {
        const detail = this.#stderrTail.at(-1);
        this.#disconnect(
          connection,
          new Error(
            `Codex app-server exited with ${exitCode}${detail ? `: ${detail}` : ""}`
          ),
          false
        );
      }
    });
    return connection;
  }

  async #initialize(
    connection: AppServerConnection
  ): Promise<InitializeResponse> {
    const params: InitializeParams = {
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
      clientInfo: {
        name: "vibepad-host",
        title: "VibePad host",
        version: "0.1.0",
      },
    };
    const initialized = await this.#requestRaw<InitializeResponse>(
      connection,
      "initialize",
      params
    );
    this.#write(connection, { method: "initialized" });
    this.#emitConnectionState({
      generation: connection.generation,
      kind: "connected",
    });
    return initialized;
  }

  async #classifyInitializeFailure(reason: unknown): Promise<Error> {
    if (reason instanceof CodexNotInstalledError || disposedClients.has(this)) {
      return connectionError(reason);
    }
    const [executable] = this.#command;
    const detail = reason instanceof Error ? reason.message : String(reason);
    const probe = await this.#probeExecutableVersion();
    if (probe.kind === "missing") {
      return notInstalledError(executable ?? "codex", reason);
    }
    const versionNote =
      probe.kind === "version"
        ? ` (installed Codex CLI reports "${probe.version}")`
        : "";
    return new CodexAppServerConnectionError(
      `Codex app-server initialize failed${versionNote}: ${detail}. VibePad requires Codex CLI 0.130 or newer; upgrade with \`npm install -g @openai/codex@latest\` if the installed version is older.`,
      reason instanceof Error ? { cause: reason } : undefined
    );
  }

  #probeExecutableVersion(): Promise<ExecutableVersionProbe> {
    const [executable] = this.#command;
    if (!executable) {
      return Promise.resolve({ kind: "unknown" });
    }
    return new Promise<ExecutableVersionProbe>((resolveProbe) => {
      let settled = false;
      const finish = (result: ExecutableVersionProbe) => {
        if (!settled) {
          settled = true;
          resolveProbe(result);
        }
      };
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(executable, ["--version"], {
          ...(this.#cwd ? { cwd: this.#cwd } : {}),
          env: this.#env,
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        finish({ kind: "unknown" });
        return;
      }
      const timer = setTimeout(() => {
        child.kill();
        finish({ kind: "unknown" });
      }, versionProbeTimeoutMs);
      let output = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        finish(
          errorCode(error) === "ENOENT"
            ? { kind: "missing" }
            : { kind: "unknown" }
        );
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        const version = output.trim();
        finish(
          code === 0 && version
            ? { kind: "version", version }
            : { kind: "unknown" }
        );
      });
    });
  }

  #requestRaw<Result>(
    connection: AppServerConnection,
    method: string,
    params: unknown
  ): Promise<Result> {
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise<Result>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(String(id));
        reject(
          new Error(
            `Codex app-server ${method} timed out after ${this.#requestTimeoutMs}ms`
          )
        );
      }, this.#requestTimeoutMs);
      this.#pending.set(String(id), {
        connectionGeneration: connection.generation,
        reject,
        resolve: resolve as (value: unknown) => void,
        timer,
      });
      try {
        this.#write(connection, { id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(String(id));
        reject(
          error instanceof Error
            ? error
            : new Error("Unable to write to Codex app-server")
        );
      }
    });
  }

  async #requestOnce<Result>(method: string, params: unknown) {
    await this.start();
    const connection = this.#connection;
    if (!connection) {
      throw new CodexAppServerConnectionError(
        "Codex app-server disconnected before the request was sent"
      );
    }
    return this.#requestRaw<Result>(connection, method, params);
  }

  #responseConnection(connectionGeneration?: number) {
    const connection = this.#connection;
    if (
      !connection ||
      connection.disconnected ||
      (connectionGeneration !== undefined &&
        connection.generation !== connectionGeneration)
    ) {
      throw new CodexAppServerConnectionError(
        "Codex app-server request belongs to a closed connection"
      );
    }
    return connection;
  }

  #write(connection: AppServerConnection, message: unknown) {
    try {
      if (
        this.#connection !== connection ||
        connection.disconnected ||
        connection.child.exitCode !== null ||
        connection.child.stdin.destroyed ||
        !connection.child.stdin.writable
      ) {
        throw new CodexAppServerConnectionError(
          "Codex app-server is not running"
        );
      }
      connection.child.stdin.write(`${JSON.stringify(message)}\n`);
    } catch (error) {
      const failure = connectionError(error);
      this.#disconnect(connection, failure, true);
      throw failure;
    }
  }

  async #consumeStdout(connection: AppServerConnection) {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of connection.child.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let lineEnd = buffer.indexOf("\n");
      while (lineEnd >= 0) {
        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 1);
        if (line) {
          this.#handleMessage(connection, JSON.parse(line) as unknown);
        }
        lineEnd = buffer.indexOf("\n");
      }
    }
    const finalLine = `${buffer}${decoder.decode()}`.trim();
    if (finalLine) {
      this.#handleMessage(connection, JSON.parse(finalLine) as unknown);
    }
  }

  async #consumeStderr(connection: AppServerConnection) {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of connection.child.stderr) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        this.#rememberStderr(line);
      }
    }
    this.#rememberStderr(`${buffer}${decoder.decode()}`);
  }

  #disconnect(connection: AppServerConnection, reason: unknown, kill: boolean) {
    if (connection.disconnected) {
      return;
    }
    connection.disconnected = true;
    const error = connectionError(reason);
    if (kill && connection.child.exitCode === null) {
      connection.child.kill();
    }
    this.#rejectPending(error, connection.generation);
    if (this.#connection === connection) {
      this.#connection = undefined;
    }
    if (this.#initialization?.generation === connection.generation) {
      this.#initialization = undefined;
    }
    this.#emitConnectionState({
      error,
      generation: connection.generation,
      kind: "disconnected",
    });
  }

  #emitConnectionState(state: CodexConnectionState) {
    for (const listener of this.#connectionListeners) {
      listener(state);
    }
  }

  #handleMessage(connection: AppServerConnection, value: unknown) {
    if (connection.disconnected) {
      return;
    }
    if (!isRecord(value)) {
      return;
    }
    const id = property(value, "id");
    const method = property(value, "method");
    if (
      (typeof id === "number" || typeof id === "string") &&
      typeof method === "string"
    ) {
      const request = {
        connectionGeneration: connection.generation,
        id,
        method,
        params: property(value, "params"),
      };
      for (const listener of this.#requestListeners) {
        listener(request);
      }
      return;
    }
    if (typeof id === "number" || typeof id === "string") {
      const pending = this.#pending.get(String(id));
      if (!pending || pending.connectionGeneration !== connection.generation) {
        return;
      }
      clearTimeout(pending.timer);
      this.#pending.delete(String(id));
      const error = property(value, "error");
      if (isRecord(error)) {
        pending.reject(new Error(stringifyError(error)));
      } else {
        pending.resolve(property(value, "result"));
      }
      return;
    }
    if (typeof method === "string") {
      const notification = {
        method,
        params: property(value, "params"),
      };
      for (const listener of this.#notificationListeners) {
        listener(notification);
      }
    }
  }

  #rejectPending(error: Error, connectionGeneration?: number) {
    for (const [id, pending] of this.#pending.entries()) {
      if (
        connectionGeneration !== undefined &&
        pending.connectionGeneration !== connectionGeneration
      ) {
        continue;
      }
      clearTimeout(pending.timer);
      pending.reject(error);
      this.#pending.delete(id);
    }
  }

  #rememberStderr(line: string) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    this.#stderrTail = [...this.#stderrTail.slice(-19), trimmed];
  }
}
