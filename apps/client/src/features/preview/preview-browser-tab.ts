import type { PreviewNavigationState } from "@/features/preview/components/preview-frame";

const leadingWwwPattern = /^www\./;

export type PreviewBrowserTabOwner = "agent" | "page" | "user";

export interface PreviewBrowserTab {
  readonly draftUrl: string;
  readonly id: string;
  readonly loading: boolean;
  readonly navigation: PreviewNavigationState;
  readonly owner: PreviewBrowserTabOwner;
  readonly sourceUrl: string;
  readonly title: string;
}

export const browserTabTitle = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("google.")) {
      return "Google";
    }
    if (parsed.pathname.includes("preview-fixture")) {
      return "Canvas Lab";
    }
    return parsed.hostname.replace(leadingWwwPattern, "") || "New page";
  } catch {
    return "New page";
  }
};
