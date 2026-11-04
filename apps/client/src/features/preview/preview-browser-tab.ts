const leadingWwwPattern = /^www\./u;

export type PreviewBrowserTabOwner = "agent" | "page" | "user";

export interface PreviewNavigationState {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly url: string;
}

export interface PreviewBrowserTab {
  readonly draftUrl: string;
  readonly id: string;
  readonly loading: boolean;
  readonly navigation: PreviewNavigationState;
  readonly owner: PreviewBrowserTabOwner;
  readonly sourceUrl: string;
  readonly title: string;
}

export const createPreviewBrowserTab = (
  id: string,
  url: string,
  owner: PreviewBrowserTabOwner
): PreviewBrowserTab => ({
  draftUrl: url,
  id,
  loading: true,
  navigation: {
    canGoBack: false,
    canGoForward: false,
    url,
  },
  owner,
  sourceUrl: url,
  title: browserTabTitle(url),
});

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
