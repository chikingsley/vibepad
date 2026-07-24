import type { MarkdownStyle } from "react-native-enriched-markdown";

import { THEME } from "@/lib/theme";

const bodyFontSize = 15;
const bodyLineHeight = 24;

/**
 * Maps VibePad theme tokens onto the enriched Markdown renderer so timeline
 * prose matches the plain-text rendering it replaces in both color schemes.
 */
export const markdownStyleForScheme = (
  scheme: "dark" | "light"
): MarkdownStyle => {
  const theme = THEME[scheme];
  return {
    blockquote: {
      borderColor: theme.border,
      color: theme.mutedForeground,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
    },
    code: {
      backgroundColor: theme.muted,
      color: theme.foreground,
    },
    codeBlock: {
      backgroundColor: theme.muted,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.foreground,
    },
    h1: { color: theme.foreground },
    h2: { color: theme.foreground },
    h3: { color: theme.foreground },
    h4: { color: theme.foreground },
    h5: { color: theme.foreground },
    h6: { color: theme.foreground },
    link: { color: theme.brand },
    list: {
      bulletColor: theme.mutedForeground,
      color: theme.foreground,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
      markerColor: theme.mutedForeground,
    },
    paragraph: {
      color: theme.foreground,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
    },
    table: {
      borderColor: theme.border,
      color: theme.foreground,
      fontSize: bodyFontSize,
      headerTextColor: theme.foreground,
    },
    thematicBreak: { color: theme.border },
  };
};
