import { useColorScheme } from "nativewind";
import { useMemo } from "react";
import { UIManager } from "react-native";

import {
  PlainMessageText,
  RichMarkdownErrorBoundary,
} from "@/features/timeline/components/rich-markdown-fallback";
import { markdownStyleForScheme } from "@/features/timeline/components/rich-markdown-theme";
import { selectRichMarkdownMode } from "@/features/timeline/model/rich-markdown-mode";

type EnrichedMarkdownModule = typeof import("react-native-enriched-markdown");
type StreamdownModule = typeof import("react-native-streamdown");
type WorkletsModule = typeof import("react-native-worklets");

const loadOptionalModule = <ModuleType,>(
  load: () => ModuleType
): ModuleType | undefined => {
  try {
    return load();
  } catch {
    // The dependency is absent from this build; callers fall back to plain text.
  }
};

/**
 * True only when the Fabric component shipped by
 * `react-native-enriched-markdown` exists in the running binary. Expo Go and
 * binaries built before this dependency landed return false and keep the
 * plain-text rendering instead of mounting an unimplemented native view.
 */
const hasEnrichedNativeComponent = (): boolean => {
  try {
    return UIManager.hasViewManagerConfig("EnrichedMarkdownText");
  } catch {
    return false;
  }
};

const enrichedMarkdown = hasEnrichedNativeComponent()
  ? loadOptionalModule<EnrichedMarkdownModule>(() =>
      require("react-native-enriched-markdown")
    )
  : undefined;

const worklets = loadOptionalModule<WorkletsModule>(() =>
  require("react-native-worklets")
);

/**
 * `StreamdownText` schedules remend on a worklet runtime, which only works
 * when the app was bundled with Worklets Bundle Mode. Requiring the module is
 * gated on that check because its import eagerly creates the worklet runtime.
 */
const streamdown =
  enrichedMarkdown && worklets?.isBundleModeEnabled()
    ? loadOptionalModule<StreamdownModule>(() =>
        require("react-native-streamdown")
      )
    : undefined;

const capabilities = {
  staticRenderer: enrichedMarkdown !== undefined,
  streamingRenderer: streamdown !== undefined,
} as const;

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

  if (mode === "rich-streaming" && streamdown) {
    return (
      <RichMarkdownErrorBoundary content={content}>
        <streamdown.StreamdownText
          flavor="github"
          markdown={content}
          markdownStyle={markdownStyle}
        />
      </RichMarkdownErrorBoundary>
    );
  }

  if (mode === "rich-static" && enrichedMarkdown) {
    return (
      <RichMarkdownErrorBoundary content={content}>
        <enrichedMarkdown.EnrichedMarkdownText
          flavor="github"
          markdown={content}
          markdownStyle={markdownStyle}
        />
      </RichMarkdownErrorBoundary>
    );
  }

  return <PlainMessageText content={content} />;
}
