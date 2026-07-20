import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Platform, View } from "react-native";
import WebView, {
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";

export interface NormalizedPreviewPoint {
  readonly requestId: string;
  readonly x: number;
  readonly y: number;
}

export interface DomAnchor {
  readonly ariaLabel?: string;
  readonly component?: string;
  readonly rect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly role?: string;
  readonly selector: string;
  readonly source?: string;
  readonly tagName: string;
  readonly text?: string;
}

export interface DomSelectionResult {
  readonly anchor?: DomAnchor;
  readonly reason?: "cross-origin" | "empty" | "unavailable";
  readonly requestId: string;
}

export interface PreviewFrameHandle {
  readonly goBack: () => void;
  readonly goForward: () => void;
  readonly reload: () => void;
  readonly selectAt: (point: NormalizedPreviewPoint) => void;
}

export interface PreviewNavigationState {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly url: string;
}

interface PreviewOpenWindowEvent {
  readonly nativeEvent: {
    readonly targetUrl: string;
  };
}

interface PreviewFrameProps {
  readonly onDomSelection: (result: DomSelectionResult) => void;
  readonly onLoadingChange: (tabId: string, loading: boolean) => void;
  readonly onNavigationStateChange: (
    tabId: string,
    state: PreviewNavigationState
  ) => void;
  readonly onOpenWindow: (url: string) => void;
  readonly ref?: Ref<PreviewFrameHandle>;
  readonly tabId: string;
  readonly url: string;
}

const messagePrefix = "__VIBEPAD_DOM__";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const selectorForElement = (element: Element): string => {
  const testId = element.getAttribute("data-testid");
  if (testId) {
    return `[data-testid=${JSON.stringify(testId)}]`;
  }
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;
  while (current && parts.length < 6) {
    let part = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        (sibling: Element) => sibling.tagName === current?.tagName
      );
      if (sameTagSiblings.length > 1) {
        part += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(" > ");
};

const selectableElement = (element: Element): Element =>
  element.closest(
    [
      "[data-vibepad-select]",
      "[data-component]",
      "[data-testid]",
      "button",
      "a",
      "input",
      "textarea",
      "select",
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="tab"]',
    ].join(",")
  ) ?? element;

const anchorForElement = (
  element: Element,
  viewportWidth: number,
  viewportHeight: number
): DomAnchor => {
  const rect = element.getBoundingClientRect();
  const text = element.textContent?.replace(/\s+/g, " ").trim().slice(0, 160);
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  const role = element.getAttribute("role")?.trim();
  const component =
    element.getAttribute("data-component")?.trim() ??
    element.getAttribute("data-testid")?.trim();
  const source = element.getAttribute("data-source")?.trim();

  return {
    ...(ariaLabel ? { ariaLabel } : {}),
    ...(component ? { component } : {}),
    rect: {
      height: viewportHeight ? rect.height / viewportHeight : 0,
      width: viewportWidth ? rect.width / viewportWidth : 0,
      x: viewportWidth ? rect.x / viewportWidth : 0,
      y: viewportHeight ? rect.y / viewportHeight : 0,
    },
    ...(role ? { role } : {}),
    selector: selectorForElement(element),
    ...(source ? { source } : {}),
    tagName: element.tagName.toLowerCase(),
    ...(text ? { text } : {}),
  };
};

const nativeSelectionScript = ({ requestId, x, y }: NormalizedPreviewPoint) =>
  `(() => {
    const requestId = ${JSON.stringify(requestId)};
    const x = ${clamp(x)} * window.innerWidth;
    const y = ${clamp(y)} * window.innerHeight;
    const hit = document.elementFromPoint(x, y);
    if (!hit) {
      window.ReactNativeWebView.postMessage(${JSON.stringify(messagePrefix)} + JSON.stringify({ requestId, reason: "empty" }));
      return;
    }
    const selectableSelector = [
      "[data-vibepad-select]",
      "[data-component]",
      "[data-testid]",
      "button",
      "a",
      "input",
      "textarea",
      "select",
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="tab"]',
    ].join(",");
    const element = hit.closest(selectableSelector) || hit;
    const escapeCss = (value) => globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
    const selectorFor = (target) => {
      const testId = target.getAttribute("data-testid");
      if (testId) return "[data-testid=" + JSON.stringify(testId) + "]";
      if (target.id) return "#" + escapeCss(target.id);
      const parts = [];
      let current = target;
      while (current && parts.length < 6) {
        let part = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === current.tagName);
          if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(" > ");
    };
    const rect = element.getBoundingClientRect();
    const optional = (value) => value && value.trim() ? value.trim() : undefined;
    const anchor = {
      ariaLabel: optional(element.getAttribute("aria-label")),
      component: optional(element.getAttribute("data-component")) || optional(element.getAttribute("data-testid")),
      rect: {
        height: rect.height / window.innerHeight,
        width: rect.width / window.innerWidth,
        x: rect.x / window.innerWidth,
        y: rect.y / window.innerHeight,
      },
      role: optional(element.getAttribute("role")),
      selector: selectorFor(element),
      source: optional(element.getAttribute("data-source")),
      tagName: element.tagName.toLowerCase(),
      text: optional(element.textContent?.replace(/\\s+/g, " ").slice(0, 160)),
    };
    Object.keys(anchor).forEach((key) => anchor[key] === undefined && delete anchor[key]);
    window.ReactNativeWebView.postMessage(${JSON.stringify(messagePrefix)} + JSON.stringify({ anchor, requestId }));
  })(); true;`;

const isDomSelectionResult = (value: unknown): value is DomSelectionResult => {
  if (!(value && typeof value === "object" && "requestId" in value)) {
    return false;
  }
  return typeof value.requestId === "string";
};

export function PreviewFrame({
  onDomSelection,
  onLoadingChange,
  onNavigationStateChange,
  onOpenWindow,
  ref,
  tabId,
  url,
}: PreviewFrameProps) {
  const nativeRef = useRef<WebView>(null);
  const webRef = useRef<HTMLIFrameElement>(null);
  const webHistoryRef = useRef({ entries: [url], index: 0 });
  const [webFrameKey, setWebFrameKey] = useState(0);

  const reportWebNavigation = useCallback(
    (nextUrl: string) => {
      const { current } = webHistoryRef;
      if (current.entries[current.index] !== nextUrl) {
        current.entries = [
          ...current.entries.slice(0, current.index + 1),
          nextUrl,
        ];
        current.index += 1;
      }
      onNavigationStateChange(tabId, {
        canGoBack: current.index > 0,
        canGoForward: current.index < current.entries.length - 1,
        url: nextUrl,
      });
    },
    [onNavigationStateChange, tabId]
  );

  useEffect(() => {
    webHistoryRef.current = { entries: [url], index: 0 };
    onNavigationStateChange(tabId, {
      canGoBack: false,
      canGoForward: false,
      url,
    });
  }, [onNavigationStateChange, tabId, url]);

  useImperativeHandle(
    ref,
    () => ({
      goBack() {
        if (Platform.OS === "web") {
          const { current } = webHistoryRef;
          if (current.index <= 0) {
            return;
          }
          current.index -= 1;
          onNavigationStateChange(tabId, {
            canGoBack: current.index > 0,
            canGoForward: true,
            url: current.entries[current.index] ?? url,
          });
          try {
            webRef.current?.contentWindow?.history.back();
          } catch {
            return;
          }
          return;
        }
        nativeRef.current?.goBack();
      },
      goForward() {
        if (Platform.OS === "web") {
          const { current } = webHistoryRef;
          if (current.index >= current.entries.length - 1) {
            return;
          }
          current.index += 1;
          onNavigationStateChange(tabId, {
            canGoBack: true,
            canGoForward: current.index < current.entries.length - 1,
            url: current.entries[current.index] ?? url,
          });
          try {
            webRef.current?.contentWindow?.history.forward();
          } catch {
            return;
          }
          return;
        }
        nativeRef.current?.goForward();
      },
      reload() {
        if (Platform.OS === "web") {
          setWebFrameKey((key) => key + 1);
          return;
        }
        nativeRef.current?.reload();
      },
      selectAt(point) {
        if (Platform.OS !== "web") {
          nativeRef.current?.injectJavaScript(nativeSelectionScript(point));
          return;
        }

        const frame = webRef.current;
        if (!frame) {
          onDomSelection({ reason: "unavailable", requestId: point.requestId });
          return;
        }
        try {
          const document = frame.contentDocument;
          if (!document) {
            onDomSelection({
              reason: "cross-origin",
              requestId: point.requestId,
            });
            return;
          }
          const element = document.elementFromPoint(
            clamp(point.x) * frame.clientWidth,
            clamp(point.y) * frame.clientHeight
          );
          onDomSelection(
            element
              ? {
                  anchor: anchorForElement(
                    selectableElement(element),
                    frame.clientWidth,
                    frame.clientHeight
                  ),
                  requestId: point.requestId,
                }
              : { reason: "empty", requestId: point.requestId }
          );
        } catch {
          onDomSelection({
            reason: "cross-origin",
            requestId: point.requestId,
          });
        }
      },
    }),
    [onDomSelection, onNavigationStateChange, tabId, url]
  );

  const handleNativeMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = event.nativeEvent.data;
      if (!message.startsWith(messagePrefix)) {
        return;
      }
      try {
        const result: unknown = JSON.parse(message.slice(messagePrefix.length));
        if (isDomSelectionResult(result)) {
          onDomSelection(result);
        }
      } catch {
        // Ignore unrelated or malformed page messages.
      }
    },
    [onDomSelection]
  );

  const finishLoading = useCallback(() => {
    onLoadingChange(tabId, false);
  }, [onLoadingChange, tabId]);
  const startLoading = useCallback(() => {
    onLoadingChange(tabId, true);
  }, [onLoadingChange, tabId]);
  const finishWebLoading = useCallback(() => {
    let nextUrl = url;
    try {
      nextUrl = webRef.current?.contentWindow?.location.href ?? url;
    } catch {
      // A cross-origin frame cannot disclose its current location.
    }
    reportWebNavigation(nextUrl);
    finishLoading();
  }, [finishLoading, reportWebNavigation, url]);
  const handleNativeNavigation = useCallback(
    (navigation: WebViewNavigation) => {
      onNavigationStateChange(tabId, {
        canGoBack: navigation.canGoBack,
        canGoForward: navigation.canGoForward,
        url: navigation.url,
      });
    },
    [onNavigationStateChange, tabId]
  );
  const handleOpenWindow = useCallback(
    (event: PreviewOpenWindowEvent) => {
      const targetUrl = event.nativeEvent.targetUrl.trim();
      if (targetUrl) {
        onOpenWindow(targetUrl);
      }
    },
    [onOpenWindow]
  );

  if (Platform.OS === "web") {
    return (
      <View className="flex-1 bg-white">
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: iframe load reports preview readiness. */}
        <iframe
          key={`${url}:${webFrameKey}`}
          onLoad={finishWebLoading}
          ref={webRef}
          src={url}
          style={{ border: 0, height: "100%", width: "100%" }}
          title="VibePad preview"
        />
      </View>
    );
  }

  return (
    <WebView
      cacheEnabled
      domStorageEnabled
      incognito={false}
      onLoadEnd={finishLoading}
      onLoadStart={startLoading}
      onMessage={handleNativeMessage}
      onNavigationStateChange={handleNativeNavigation}
      onOpenWindow={handleOpenWindow}
      ref={nativeRef}
      setSupportMultipleWindows
      sharedCookiesEnabled
      source={{ uri: url }}
      style={{ flex: 1 }}
      thirdPartyCookiesEnabled
    />
  );
}
