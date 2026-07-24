/**
 * Projection of agy turns into VibePad timeline items.
 *
 * agy print mode maps cleanly onto exactly one user message and one plain-text
 * assistant message per turn: spawn -> running, stdout chunks -> answer text,
 * exit 0 -> completed, non-zero exit -> error
 * (happy-cli/src/agy/AgyBackend.ts:5-15). There are no tool, shell, or
 * file-change items to project.
 */

import type { TimelineItem } from "@vibepad/protocol/timeline";

export type AgyTurnStatus = "completed" | "failed" | "running";

export interface AgyTurn {
  /** Epoch milliseconds when the agy process exited, when it has. */
  readonly completedAt?: number;
  /** Failure detail (exit code, spawn error) for failed turns. */
  readonly error?: string;
  readonly id: string;
  /** Concatenated stdout of the `agy --print` process so far. */
  readonly output: string;
  /** The prompt passed as the value of `--print`. */
  readonly prompt: string;
  /** Epoch milliseconds when the agy process was spawned. */
  readonly startedAt: number;
  readonly status: AgyTurnStatus;
}

const iso = (milliseconds: number) => new Date(milliseconds).toISOString();

const completion = (turn: AgyTurn) =>
  turn.completedAt === undefined ? {} : { completedAt: iso(turn.completedAt) };

export const mapAgyTurn = (
  sessionId: string,
  turn: AgyTurn
): TimelineItem[] => {
  const common = {
    ...completion(turn),
    createdAt: iso(turn.startedAt),
    native: { turn },
    sessionId,
    turnId: turn.id,
    visibility: "primary" as const,
  };
  const items: TimelineItem[] = [
    {
      ...common,
      id: `${turn.id}:user`,
      kind: "message",
      parts: [
        {
          format: "plain",
          id: `${turn.id}:user:0`,
          text: turn.prompt,
          type: "text",
        },
      ],
      role: "user",
    },
  ];
  if (turn.output.length > 0 || turn.status !== "failed") {
    items.push({
      ...common,
      id: `${turn.id}:assistant`,
      kind: "message",
      parts: [
        {
          format: "markdown",
          id: `${turn.id}:assistant:0`,
          text: turn.output,
          type: "text",
        },
      ],
      role: "assistant",
    });
  }
  if (turn.status === "failed") {
    items.push({
      ...common,
      id: `${turn.id}:error`,
      kind: "notice",
      parts: [
        {
          format: "plain",
          id: `${turn.id}:error:0`,
          text: turn.error ?? "agy turn failed",
          type: "text",
        },
      ],
      role: "system",
    });
  }
  return items;
};

export const mapAgyTurns = (
  sessionId: string,
  turns: readonly AgyTurn[]
): TimelineItem[] => turns.flatMap((turn) => mapAgyTurn(sessionId, turn));
