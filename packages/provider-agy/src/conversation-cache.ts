/**
 * Reader for agy's per-workspace conversation cache.
 *
 * Protocol evidence: `agy --print` does not echo the conversation id it
 * creates, but agy records the most recent conversation per workspace in
 * `~/.gemini/antigravity-cli/cache/last_conversations.json`, a JSON object
 * mapping cwd -> conversation id. Reading it back is the only known way to
 * recover an id for `--conversation`-based resume
 * (happy-cli/src/agy/conversationStore.ts:1-43, constants.ts:80-91). The
 * realpath fallback exists because macOS reports `/tmp/...` while the cache
 * key is `/private/tmp/...` (conversationStore.ts:18-21).
 */

import { readFileSync, realpathSync } from "node:fs";
import { agyConversationsCachePath } from "./constants";

const entryFor = (
  cache: Readonly<Record<string, unknown>>,
  key: string
): string | null => {
  const value = Reflect.get(cache, key);
  return typeof value === "string" ? value : null;
};

/**
 * Look up the agy conversation id recorded for `cwd`. Tries the path as given
 * and its realpath. Returns null when the cache is missing, unreadable, or
 * has no entry for the cwd.
 */
export const readAgyConversationId = (
  cwd: string,
  cachePath: string = agyConversationsCachePath()
): string | null => {
  let cache: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readFileSync(cachePath, "utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    cache = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const direct = entryFor(cache, cwd);
  if (direct) {
    return direct;
  }
  try {
    return entryFor(cache, realpathSync(cwd));
  } catch {
    return null;
  }
};

/** Enumerate every workspace path that has a recorded conversation. */
export const listAgyConversationWorkspaces = (
  cachePath: string = agyConversationsCachePath()
): readonly (readonly [cwd: string, conversationId: string])[] => {
  let cache: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readFileSync(cachePath, "utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return [];
    }
    cache = parsed as Record<string, unknown>;
  } catch {
    return [];
  }
  return Object.entries(cache).flatMap(([cwd, conversationId]) =>
    typeof conversationId === "string" ? [[cwd, conversationId] as const] : []
  );
};
