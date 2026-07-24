import { useColorScheme } from "nativewind";
import { useMemo } from "react";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import remend, { type RemendOptions } from "remend";

import {
  PlainMessageText,
  RichMarkdownErrorBoundary,
} from "@/features/timeline/components/rich-markdown-fallback";
import { markdownStyleForScheme } from "@/features/timeline/components/rich-markdown-theme";
import { selectRichMarkdownMode } from "@/features/timeline/model/rich-markdown-mode";

/**
 * Web renders through the DOM implementation of
 * `react-native-enriched-markdown`. `react-native-streamdown` is native-only
 * (its import creates a worklet runtime, which web does not support), so the
 * streaming tail runs the same remend completion synchronously; chat-sized
 * text keeps that repair fast on the JS thread.
 */
const capabilities = {
  staticRenderer: true,
  streamingRenderer: true,
} as const;

/** Mirrors the default remend configuration used by `StreamdownText`. */
const remendConfig: RemendOptions = {
  bold: true,
  boldItalic: true,
  images: true,
  inlineCode: true,
  italic: true,
  katex: false,
  linkMode: "text-only",
  links: true,
  setextHeadings: true,
  strikethrough: true,
};

export function RichMarkdown({
  content,
  streaming,
}: {
  readonly content: string;
  readonly streaming: boolean;
}) {
  const { colorScheme } = useColorScheme();
  const markdownStyle = useMemo(
    () => markdownStyleForScheme(colorScheme === "dark" ? "dark" : "light"),
    [colorScheme]
  );
  const mode = selectRichMarkdownMode(capabilities, streaming);
  const markdown = useMemo(
    () => (mode === "rich-streaming" ? remend(content, remendConfig) : content),
    [content, mode]
  );

  if (mode === "plain") {
    return <PlainMessageText content={content} />;
  }

  return (
    <RichMarkdownErrorBoundary content={content}>
      <EnrichedMarkdownText markdown={markdown} markdownStyle={markdownStyle} />
    </RichMarkdownErrorBoundary>
  );
}
