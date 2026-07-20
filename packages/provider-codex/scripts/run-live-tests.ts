import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { spawn } from "bun";

import type { Thread } from "../generated/v2/Thread";
import type { ThreadListResponse } from "../generated/v2/ThreadListResponse";
import { CodexAppServerClient } from "../src/app-server-client";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(scriptDirectory, "../../..");
const environment = process.env as Readonly<{
  VIBEPAD_CODEX_BIN?: string;
  VIBEPAD_LIVE_PROJECT_DIR?: string;
}>;
const executable = environment.VIBEPAD_CODEX_BIN ?? "codex";

const generatedVersion = (
  await readFile(resolve(packageDirectory, "generated/VERSION"), "utf8")
).trim();
const versionProcess = spawn([executable, "--version"], {
  cwd: repositoryDirectory,
  stderr: "pipe",
  stdout: "pipe",
});
const [versionExitCode, versionStdout, versionStderr] = await Promise.all([
  versionProcess.exited,
  new Response(versionProcess.stdout).text(),
  new Response(versionProcess.stderr).text(),
]);
if (versionExitCode !== 0) {
  throw new Error(
    versionStderr.trim() || `Unable to read Codex version from ${executable}`
  );
}
const installedVersion = versionStdout.trim();
if (installedVersion !== generatedVersion) {
  throw new Error(
    `Codex binding version mismatch: generated ${generatedVersion}, installed ${installedVersion}. Run bun run --filter @vibepad/provider-codex generate:bindings and review the generated diff.`
  );
}

console.log(`Codex live tests using ${installedVersion}`);
const vitest = spawn(
  [
    resolve(repositoryDirectory, "node_modules/.bin/vitest"),
    "run",
    "--reporter=verbose",
  ],
  {
    cwd: packageDirectory,
    env: {
      ...process.env,
      VIBEPAD_LIVE_CODEX_TESTS: "1",
      VIBEPAD_LIVE_PROJECT_DIR:
        environment.VIBEPAD_LIVE_PROJECT_DIR ?? repositoryDirectory,
    },
    stderr: "inherit",
    stdout: "inherit",
  }
);
let exitCode = await vitest.exited;

const delay = (milliseconds: number) =>
  new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });

const listThreads = async (client: CodexAppServerClient, archived: boolean) => {
  const threads: Thread[] = [];
  let cursor: string | null = null;
  do {
    // biome-ignore lint/performance/noAwaitInLoops: Codex thread pages are cursor-dependent.
    const page = await client.request<ThreadListResponse>(
      "thread/list",
      {
        archived,
        ...(cursor ? { cursor } : {}),
        limit: 200,
        sortDirection: "desc",
        sortKey: "updated_at",
      },
      { retryOnDisconnect: true }
    );
    threads.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return threads;
};

const listTaggedThreads = async (client: CodexAppServerClient) => {
  const pages = await Promise.all([
    listThreads(client, false),
    listThreads(client, true),
  ]);
  return [
    ...new Map(
      pages
        .flat()
        .filter((thread) =>
          `${thread.name ?? ""}\n${thread.preview}`.includes("VIBEPAD_CODEX_")
        )
        .map((thread) => [thread.id, thread])
    ).values(),
  ];
};

const waitForCleanup = async (
  client: CodexAppServerClient,
  attemptsRemaining = 50
): Promise<readonly Thread[]> => {
  const tagged = await listTaggedThreads(client);
  if (tagged.length === 0 || attemptsRemaining <= 0) {
    return tagged;
  }
  await delay(100);
  return waitForCleanup(client, attemptsRemaining - 1);
};

const cleanupClient = new CodexAppServerClient({
  command: [executable, "app-server", "--listen", "stdio://"],
  cwd: repositoryDirectory,
});
try {
  const tagged = await waitForCleanup(cleanupClient, exitCode === 0 ? 50 : 5);
  if (tagged.length > 0) {
    console.error(
      `Codex live tests left ${tagged.length} tagged thread(s): ${tagged
        .map((thread) => thread.id)
        .join(", ")}`
    );
    await Promise.allSettled(
      tagged.map((thread) =>
        cleanupClient.request("thread/delete", { threadId: thread.id })
      )
    );
    exitCode = 1;
  } else {
    console.log("Codex live-test cleanup verified");
  }
} catch (error) {
  console.error("Unable to verify Codex live-test cleanup", error);
  exitCode = 1;
} finally {
  await cleanupClient.dispose();
}

process.exitCode = exitCode;
