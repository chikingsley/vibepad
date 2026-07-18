import { DarkTheme, DefaultTheme } from "expo-router";

type Theme = typeof DefaultTheme;

export const THEME = {
  dark: {
    accent: "hsl(153 25% 17%)",
    accentForeground: "hsl(153 55% 74%)",
    background: "hsl(220 14% 7%)",
    border: "hsl(220 10% 20%)",
    card: "hsl(220 12% 10%)",
    cardForeground: "hsl(40 15% 94%)",
    destructive: "hsl(0 63% 48%)",
    destructiveForeground: "hsl(0 0% 100%)",
    foreground: "hsl(40 15% 94%)",
    input: "hsl(220 10% 20%)",
    muted: "hsl(220 10% 15%)",
    mutedForeground: "hsl(220 8% 62%)",
    popover: "hsl(220 12% 9%)",
    popoverForeground: "hsl(40 15% 94%)",
    primary: "hsl(153 55% 55%)",
    primaryForeground: "hsl(220 14% 7%)",
    radius: "0.75rem",
    ring: "hsl(153 55% 55%)",
    secondary: "hsl(220 10% 16%)",
    secondaryForeground: "hsl(40 15% 92%)",
  },
  light: {
    accent: "hsl(153 35% 90%)",
    accentForeground: "hsl(153 65% 20%)",
    background: "hsl(40 20% 98%)",
    border: "hsl(40 10% 84%)",
    card: "hsl(40 18% 96%)",
    cardForeground: "hsl(220 14% 10%)",
    destructive: "hsl(0 72% 51%)",
    destructiveForeground: "hsl(0 0% 100%)",
    foreground: "hsl(220 14% 10%)",
    input: "hsl(40 10% 84%)",
    muted: "hsl(40 10% 92%)",
    mutedForeground: "hsl(220 8% 43%)",
    popover: "hsl(40 20% 99%)",
    popoverForeground: "hsl(220 14% 10%)",
    primary: "hsl(153 61% 38%)",
    primaryForeground: "hsl(0 0% 100%)",
    radius: "0.75rem",
    ring: "hsl(153 61% 38%)",
    secondary: "hsl(40 12% 91%)",
    secondaryForeground: "hsl(220 14% 15%)",
  },
} as const;

export const NAV_THEME: Record<"dark" | "light", Theme> = {
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
};
