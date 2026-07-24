/**
 * Argv builder for a single `agy --print` turn.
 *
 * Protocol evidence:
 * - agy's only non-interactive surface is `agy --print "<prompt>"`, which
 *   streams the final answer as plain text on stdout and exits; there are no
 *   tool-call or permission events in print mode
 *   (happy-cli/src/agy/AgyBackend.ts:1-16, cliArgs.ts:11-16). Print mode is
 *   also documented publicly as "-p / --print" in
 *   https://github.com/google-antigravity/antigravity-cli/issues/76 and
 *   https://github.com/google-antigravity/antigravity-cli/issues/318.
 * - Flags and their ordering (`--conversation`, `--model`,
 *   `--dangerously-skip-permissions` | `--sandbox`, repeatable `--add-dir`,
 *   `--print-timeout`, `--print <prompt>` last):
 *   happy-cli/src/agy/cliArgs.ts:43-66. `--dangerously-skip-permissions` and
 *   `--print-timeout` are corroborated by issue #76; `--sandbox` by issue
 *   #318 (URLs above).
 * - Non-skip modes cannot gate per tool: agy's own settings.json governs
 *   approvals under `--sandbox` (happy-cli/src/agy/cliArgs.ts:11-16,
 *   AgyBackend.ts:14-15).
 */

export interface BuildAgyArgsOptions {
  /** Directories to expose to agy via repeatable `--add-dir`. */
  readonly addDirs?: readonly string[];
  /** Conversation id to resume via `--conversation`; omit for a fresh one. */
  readonly conversationId?: string | null;
  /** Model display name passed to `--model` (e.g. "Gemini 3.1 Pro (High)"). */
  readonly model?: string;
  /** Value for `--print-timeout` (e.g. "10m"). */
  readonly printTimeout?: string;
  /** The user prompt for this turn. */
  readonly prompt: string;
  /** Auto-approve every tool via `--dangerously-skip-permissions`. */
  readonly skipPermissions: boolean;
}

/**
 * Build the argv for one `agy --print` invocation. The prompt is placed last
 * (as the value of `--print`) so all preceding flags parse cleanly
 * (happy-cli/src/agy/cliArgs.ts:39-42).
 */
export const buildAgyArgs = (options: BuildAgyArgsOptions): string[] => {
  const args: string[] = [];
  if (options.conversationId) {
    args.push("--conversation", options.conversationId);
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  args.push(
    options.skipPermissions ? "--dangerously-skip-permissions" : "--sandbox"
  );
  for (const directory of options.addDirs ?? []) {
    args.push("--add-dir", directory);
  }
  if (options.printTimeout) {
    args.push("--print-timeout", options.printTimeout);
  }
  args.push("--print", options.prompt);
  return args;
};
