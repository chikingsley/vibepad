import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Linking, Platform, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { BrowserTabStrip } from "@/features/preview/components/browser-tab-strip";
import { FeedbackOverlay } from "@/features/preview/components/feedback-overlay";
import {
  PreviewFrame,
  type PreviewFrameHandle,
} from "@/features/preview/components/preview-frame";
import { PreviewInteractionBar } from "@/features/preview/components/preview-interaction-bar";
import { PreviewNavigationBar } from "@/features/preview/components/preview-navigation-bar";
import { PreviewReviewTray } from "@/features/preview/components/preview-review-tray";
import {
  browserTabTitle,
  type PreviewBrowserTab,
  type PreviewBrowserTabOwner,
  type PreviewNavigationState,
} from "@/features/preview/preview-browser-tab";
import type { DomSelectionResult } from "@/features/preview/preview-dom-selection";
import type {
  FeedbackPoint,
  FeedbackSelectionPoint,
  FeedbackStroke,
  PreviewInteractionMode,
} from "@/features/preview/preview-interaction";
import type {
  PreviewSelectionCue,
  PreviewStrokeCue,
} from "@/features/preview/preview-review";
import { idlePreviewSession } from "@/features/preview/state/preview-store";
import { useVibePadPreviewStore } from "@/lib/vibepad-host-context";

interface PendingSelection {
  readonly offsetMs: number;
  readonly point: FeedbackPoint;
  readonly target: {
    readonly tabId: string;
    readonly url: string;
  };
}

interface PreviewSurfaceProps {
  readonly canSendReview: boolean;
  readonly errorMessage: string | undefined;
  readonly expanded: boolean;
  readonly hostName: string;
  readonly onClose: () => void;
  readonly onSendReview: () => void;
  readonly onToggleExpanded: () => void;
  readonly sending: boolean;
  readonly sessionId: string;
  readonly showReviewTray: boolean;
}

const httpUrlPattern = /^https?:\/\//i;

const ensureUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return httpUrlPattern.test(trimmed) ? trimmed : `http://${trimmed}`;
};

const defaultPreviewUrl = (hostName: string) => {
  const { location } = globalThis as typeof globalThis & {
    readonly location?: { readonly origin?: string };
  };
  if (Platform.OS === "web" && location?.origin) {
    return new URL("/design/preview-fixture", location.origin).toString();
  }
  return `http://${hostName}:8081/design/preview-fixture`;
};

const newBrowserTabUrl = () =>
  Platform.OS === "web"
    ? "https://www.google.com/webhp?igu=1"
    : "https://www.google.com";

export function PreviewSurface({
  canSendReview,
  errorMessage,
  expanded,
  hostName,
  onClose,
  onSendReview,
  onToggleExpanded,
  sending,
  sessionId,
  showReviewTray,
}: PreviewSurfaceProps) {
  const preview = useVibePadPreviewStore();
  const initialUrl = useMemo(() => defaultPreviewUrl(hostName), [hostName]);
  const frameRefs = useRef(new Map<string, PreviewFrameHandle>());
  const frameRefCallbacks = useRef(
    new Map<string, (handle: PreviewFrameHandle | null) => void>()
  );
  const pendingSelections = useRef(new Map<string, PendingSelection>());
  const { activeTabId, mode, review, tabs } = useValue(
    () => preview.state$.bySessionId[sessionId]?.get() ?? idlePreviewSession
  );
  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  useEffect(() => {
    preview.ensureSession(sessionId, initialUrl);
  }, [initialUrl, preview, sessionId]);

  const updateTab = useCallback(
    (tabId: string, update: (tab: PreviewBrowserTab) => PreviewBrowserTab) => {
      preview.updateTab(sessionId, tabId, update);
    },
    [preview, sessionId]
  );

  const refForTab = useCallback((tabId: string) => {
    const existing = frameRefCallbacks.current.get(tabId);
    if (existing) {
      return existing;
    }
    const callback = (handle: PreviewFrameHandle | null) => {
      if (handle) {
        frameRefs.current.set(tabId, handle);
      } else {
        frameRefs.current.delete(tabId);
      }
    };
    frameRefCallbacks.current.set(tabId, callback);
    return callback;
  }, []);

  const openBrowserTab = useCallback(
    (url: string, owner: PreviewBrowserTabOwner) => {
      preview.openTab(sessionId, url, owner);
    },
    [preview, sessionId]
  );
  const openNewTab = useCallback(() => {
    openBrowserTab(newBrowserTabUrl(), "user");
  }, [openBrowserTab]);
  const openPageTab = useCallback(
    (url: string) => {
      openBrowserTab(url, "page");
    },
    [openBrowserTab]
  );
  const selectTab = useCallback(
    (tabId: string) => {
      preview.selectTab(sessionId, tabId);
    },
    [preview, sessionId]
  );
  const closeTab = useCallback(
    (tabId: string) => {
      if (!tabs.some((tab) => tab.id === tabId)) {
        return;
      }
      frameRefs.current.delete(tabId);
      frameRefCallbacks.current.delete(tabId);

      let removedPendingSelection = false;
      for (const [requestId, pending] of pendingSelections.current) {
        if (pending.target.tabId === tabId) {
          pendingSelections.current.delete(requestId);
          removedPendingSelection = true;
        }
      }
      if (removedPendingSelection) {
        preview.updateReview(sessionId, (current) => ({
          ...current,
          pendingSelectionCount: pendingSelections.current.size,
        }));
      }

      if (preview.closeTab(sessionId, tabId) === 0) {
        onClose();
      }
    },
    [onClose, preview, sessionId, tabs]
  );

  useEffect(() => {
    if (review.reviewing) {
      return;
    }
    pendingSelections.current.clear();
  }, [review.reviewing]);

  useEffect(
    () => () => {
      const pendingCount = pendingSelections.current.size;
      pendingSelections.current.clear();
      preview.clearPendingSelections(sessionId, pendingCount);
    },
    [preview, sessionId]
  );

  const addStroke = useCallback(
    (points: readonly FeedbackPoint[]) => {
      if (!activeTab) {
        return;
      }
      const identity = preview.startCue(sessionId, "stroke");
      if (!identity) {
        return;
      }
      const cue: PreviewStrokeCue = {
        id: identity.id,
        kind: "stroke",
        offsetMs: identity.offsetMs,
        points,
        target: {
          tabId: activeTab.id,
          url: activeTab.navigation.url,
        },
      };
      preview.updateReview(sessionId, (current) => ({
        ...current,
        cues: [...current.cues, cue],
        reviewing: true,
      }));
    },
    [activeTab, preview, sessionId]
  );

  const selectPoint = useCallback(
    (point: FeedbackPoint) => {
      if (!activeTab) {
        return;
      }
      const identity = preview.startCue(sessionId, "selection");
      if (!identity) {
        return;
      }
      const requestId = identity.id;
      pendingSelections.current.set(requestId, {
        offsetMs: identity.offsetMs,
        point,
        target: {
          tabId: activeTab.id,
          url: activeTab.navigation.url,
        },
      });
      preview.updateReview(sessionId, (current) => ({
        ...current,
        pendingSelectionCount: pendingSelections.current.size,
      }));
      frameRefs.current
        .get(activeTab.id)
        ?.selectAt({ requestId, x: point.x, y: point.y });
    },
    [activeTab, preview, sessionId]
  );

  const receiveDomSelection = useCallback(
    (result: DomSelectionResult) => {
      const pending = pendingSelections.current.get(result.requestId);
      if (!pending) {
        return;
      }
      pendingSelections.current.delete(result.requestId);
      const cue: PreviewSelectionCue = {
        ...(result.anchor ? { anchor: result.anchor } : {}),
        id: result.requestId,
        kind: "selection",
        offsetMs: pending.offsetMs,
        point: pending.point,
        ...(result.reason ? { reason: result.reason } : {}),
        target: pending.target,
      };
      preview.updateReview(sessionId, (current) => ({
        ...current,
        cues: [...current.cues, cue],
        pendingSelectionCount: pendingSelections.current.size,
      }));
    },
    [preview, sessionId]
  );

  const loadDraftUrl = useCallback(() => {
    if (!activeTab) {
      return;
    }
    const nextUrl = ensureUrl(activeTab.draftUrl);
    if (!nextUrl) {
      return;
    }
    updateTab(activeTab.id, (tab) => ({
      ...tab,
      draftUrl: nextUrl,
      loading: true,
      navigation: {
        canGoBack: false,
        canGoForward: false,
        url: nextUrl,
      },
      sourceUrl: nextUrl,
      title: browserTabTitle(nextUrl),
    }));
  }, [activeTab, updateTab]);

  const submitDraftUrl = useCallback(() => {
    loadDraftUrl();
  }, [loadDraftUrl]);

  const goBack = useCallback(() => {
    if (activeTab) {
      frameRefs.current.get(activeTab.id)?.goBack();
    }
  }, [activeTab]);
  const goForward = useCallback(() => {
    if (activeTab) {
      frameRefs.current.get(activeTab.id)?.goForward();
    }
  }, [activeTab]);
  const reload = useCallback(() => {
    if (!activeTab) {
      return;
    }
    updateTab(activeTab.id, (tab) => ({ ...tab, loading: true }));
    frameRefs.current.get(activeTab.id)?.reload();
  }, [activeTab, updateTab]);
  const openExternal = useCallback(() => {
    if (activeTab) {
      Linking.openURL(activeTab.navigation.url).catch(() => undefined);
    }
  }, [activeTab]);
  const changeDraftUrl = useCallback(
    (value: string) => {
      if (activeTab) {
        updateTab(activeTab.id, (tab) => ({ ...tab, draftUrl: value }));
      }
    },
    [activeTab, updateTab]
  );
  const receiveNavigationState = useCallback(
    (tabId: string, nextNavigation: PreviewNavigationState) => {
      updateTab(tabId, (tab) => ({
        ...tab,
        draftUrl: nextNavigation.url,
        navigation: nextNavigation,
        title: browserTabTitle(nextNavigation.url),
      }));
    },
    [updateTab]
  );
  const receiveLoadingState = useCallback(
    (tabId: string, loading: boolean) => {
      updateTab(tabId, (tab) => ({ ...tab, loading }));
    },
    [updateTab]
  );

  const cancelReview = useCallback(() => {
    pendingSelections.current.clear();
    preview.clearReview(sessionId);
  }, [preview, sessionId]);

  const removeCue = useCallback(
    (cueId: string) => {
      preview.removeCue(sessionId, cueId);
    },
    [preview, sessionId]
  );
  const selectMode = useCallback(
    (nextMode: PreviewInteractionMode) => {
      preview.setMode(sessionId, nextMode);
    },
    [preview, sessionId]
  );

  const strokes = useMemo<readonly FeedbackStroke[]>(
    () =>
      review.cues.flatMap((cue) =>
        cue.kind === "stroke" && cue.target.tabId === activeTabId
          ? [{ id: cue.id, points: cue.points }]
          : []
      ),
    [activeTabId, review.cues]
  );
  const selections = useMemo<readonly FeedbackSelectionPoint[]>(
    () =>
      review.cues.flatMap((cue) =>
        cue.kind === "selection" && cue.target.tabId === activeTabId
          ? [
              {
                id: cue.id,
                ...(cue.anchor ? { rect: cue.anchor.rect } : {}),
                x: cue.point.x,
                y: cue.point.y,
              },
            ]
          : []
      ),
    [activeTabId, review.cues]
  );

  return (
    <View className="flex-1 bg-background" testID="preview-surface">
      <BrowserTabStrip
        activeTabId={activeTabId}
        onClose={closeTab}
        onNewTab={openNewTab}
        onSelect={selectTab}
        sessionId={sessionId}
        tabs={tabs}
      />
      <PreviewNavigationBar
        canGoBack={activeTab?.navigation.canGoBack ?? false}
        canGoForward={activeTab?.navigation.canGoForward ?? false}
        draftUrl={activeTab?.draftUrl ?? ""}
        expanded={expanded}
        hasActiveTab={Boolean(activeTab)}
        loading={activeTab?.loading ?? false}
        onBack={goBack}
        onClose={onClose}
        onDraftUrlChange={changeDraftUrl}
        onForward={goForward}
        onOpenExternal={openExternal}
        onReload={reload}
        onSubmitDraftUrl={submitDraftUrl}
        onToggleExpanded={onToggleExpanded}
      />

      <PreviewInteractionBar mode={mode} onSelectMode={selectMode} />

      <View className="relative flex-1 overflow-hidden bg-white">
        {tabs.map((tab) => (
          <View
            className="absolute inset-0"
            key={tab.id}
            style={{ display: tab.id === activeTabId ? "flex" : "none" }}
          >
            <PreviewFrame
              onDomSelection={receiveDomSelection}
              onLoadingChange={receiveLoadingState}
              onNavigationStateChange={receiveNavigationState}
              onOpenWindow={openPageTab}
              ref={refForTab(tab.id)}
              tabId={tab.id}
              url={tab.sourceUrl}
            />
          </View>
        ))}
        {activeTab ? (
          <FeedbackOverlay
            mode={mode}
            onSelect={selectPoint}
            onStroke={addStroke}
            selections={selections}
            strokes={strokes}
          />
        ) : (
          <View className="flex-1 items-center justify-center gap-3 bg-muted/20">
            <Text className="text-sm" variant="muted">
              No open browser tabs
            </Text>
            <Button onPress={openNewTab} size="sm" variant="outline">
              <Icon name="plus" size={13} />
              <Text>Open tab</Text>
            </Button>
          </View>
        )}
        {showReviewTray && review.cues.length > 0 ? (
          <PreviewReviewTray
            canSend={canSendReview}
            cues={review.cues}
            errorMessage={errorMessage}
            onCancel={cancelReview}
            onRemoveCue={removeCue}
            onSend={onSendReview}
            sending={sending}
          />
        ) : null}
      </View>
    </View>
  );
}
