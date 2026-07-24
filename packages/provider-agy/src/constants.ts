/**
 * Antigravity CLI (`agy`) constants.
 *
 * Protocol evidence for everything in this file:
 * - Binary name and install location (`~/.local/bin/agy`):
 *   References/happy/packages/happy-cli/src/agy/constants.ts:15-54.
 * - Model display names as printed by `agy models` (agy expects the full
 *   display string, not a slug): happy-cli/src/agy/constants.ts:56-69.
 * - Default model: happy-cli/src/agy/constants.ts:71-75.
 * - Print-mode timeout flag value: happy-cli/src/agy/constants.ts:77-78.
 * - Per-workspace conversation cache path
 *   `~/.gemini/antigravity-cli/cache/last_conversations.json`:
 *   happy-cli/src/agy/constants.ts:80-91. The sibling
 *   `~/.gemini/antigravity-cli/settings.json` and `cli.log` paths are also
 *   reported publicly in
 *   https://github.com/google-antigravity/antigravity-cli/issues/76.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/** Command name for the Antigravity CLI binary. */
export const AGY_BIN = "agy";

/**
 * Model display names accepted by `agy --model`, as printed by `agy models`.
 * Recorded from a machine with the CLI installed
 * (happy-cli/src/agy/constants.ts:60-69, captured 2026-07-20).
 */
export const AGY_MODELS = [
  "Gemini 3.5 Flash (Medium)",
  "Gemini 3.5 Flash (High)",
  "Gemini 3.5 Flash (Low)",
  "Gemini 3.1 Pro (Low)",
  "Gemini 3.1 Pro (High)",
  "Claude Sonnet 4.6 (Thinking)",
  "Claude Opus 4.6 (Thinking)",
  "GPT-OSS 120B (Medium)",
] as const;

/** Default agy model (happy-cli/src/agy/constants.ts:75). */
export const DEFAULT_AGY_MODEL = "Gemini 3.1 Pro (High)";

/** Default value for `agy --print-timeout` (happy-cli/src/agy/constants.ts:78). */
export const AGY_PRINT_TIMEOUT = "10m";

/**
 * Path to agy's per-workspace conversation cache: a JSON object mapping each
 * cwd to the id of the most recent conversation started there
 * (happy-cli/src/agy/constants.ts:85-91, conversationStore.ts:24-31).
 */
export const agyConversationsCachePath = () =>
  join(
    homedir(),
    ".gemini",
    "antigravity-cli",
    "cache",
    "last_conversations.json"
  );

const windowsExtensions = [".cmd", ".exe", ""] as const;

const executableCandidates = (directory: string) =>
  process.platform === "win32"
    ? windowsExtensions.map((extension) =>
        join(directory, `${AGY_BIN}${extension}`)
      )
    : [join(directory, AGY_BIN)];

/**
 * Resolve the agy executable to a spawnable path. agy installs to
 * `~/.local/bin`, which daemons frequently lack on PATH
 * (happy-cli/src/agy/constants.ts:18-30). Resolution order:
 *   1. `VIBEPAD_AGY_BIN` env override (absolute path to the binary).
 *   2. First match on PATH.
 *   3. `~/.local/bin/agy`, the installer's default location.
 * Falls back to the bare name so callers surface a clear ENOENT.
 */
export const resolveAgyBin = (
  env: Readonly<Record<string, string | undefined>> = process.env
): string => {
  const override = Reflect.get(env, "VIBEPAD_AGY_BIN");
  if (
    typeof override === "string" &&
    override.length > 0 &&
    existsSync(override)
  ) {
    return override;
  }
  const searchPath = Reflect.get(env, "PATH");
  for (const directory of (searchPath ?? "").split(delimiter)) {
    if (!directory) {
      continue;
    }
    for (const candidate of executableCandidates(directory)) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  const localBin = join(homedir(), ".local", "bin", AGY_BIN);
  if (existsSync(localBin)) {
    return localBin;
  }
  return AGY_BIN;
};
