export type RichMarkdownMode = "plain" | "rich-static" | "rich-streaming";

export interface RichMarkdownCapabilities {
  readonly staticRenderer: boolean;
  readonly streamingRenderer: boolean;
}

/**
 * Chooses how one assistant text part renders.
 *
 * - A streaming tail needs the streaming renderer, which keeps incomplete
 *   Markdown syntax stable. Feeding a partial document to the static renderer
 *   would flicker on dangling emphasis and half-built tables, so an
 *   unavailable streaming renderer falls back to plain text instead.
 * - A completed block prefers the enriched static renderer and avoids
 *   continuous stream processing.
 * - Any path without its renderer keeps the existing plain-text rendering.
 */
export const selectRichMarkdownMode = (
  capabilities: RichMarkdownCapabilities,
  streaming: boolean
): RichMarkdownMode => {
  if (streaming) {
    return capabilities.streamingRenderer ? "rich-streaming" : "plain";
  }
  return capabilities.staticRenderer ? "rich-static" : "plain";
};

/**
 * An assistant message block without a completion timestamp is the active
 * streaming tail. User and system prose never streams through the Markdown
 * pipeline.
 */
export const isStreamingMessageBlock = (block: {
  readonly completedAt?: string | undefined;
  readonly role: "assistant" | "system" | "user";
}): boolean => block.role === "assistant" && block.completedAt === undefined;
