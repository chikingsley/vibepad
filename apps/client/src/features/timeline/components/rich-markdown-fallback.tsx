import { Component, type ReactNode } from "react";

import { Text } from "@/components/ui/text";

/**
 * The pre-existing plain-text message rendering. Every rich Markdown path
 * degrades to exactly this component, so a missing or failing renderer never
 * crashes or blanks a message.
 */
export function PlainMessageText({ content }: { readonly content: string }) {
  return (
    <Text className="text-[15px] leading-6" selectable>
      {content}
    </Text>
  );
}

interface RichMarkdownErrorBoundaryProps {
  readonly children: ReactNode;
  readonly content: string;
}

interface RichMarkdownErrorBoundaryState {
  readonly failed: boolean;
}

/**
 * Catches renderer failures (for example a build without the enriched native
 * component) and falls back to the plain-text rendering of the same content.
 */
// biome-ignore lint/style/useReactFunctionComponents: React error boundaries require a class component.
export class RichMarkdownErrorBoundary extends Component<
  RichMarkdownErrorBoundaryProps,
  RichMarkdownErrorBoundaryState
> {
  static getDerivedStateFromError(): RichMarkdownErrorBoundaryState {
    return { failed: true };
  }

  override state: RichMarkdownErrorBoundaryState = { failed: false };

  override render() {
    if (this.state.failed) {
      return <PlainMessageText content={this.props.content} />;
    }
    return this.props.children;
  }
}
