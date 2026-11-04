import { useValue } from "@legendapp/state/react";
import type { BrowserTarget } from "@vibepad/protocol/browser";
import { useCallback, useEffect, useMemo } from "react";
import { Linking, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { BrowserTabStrip } from "@/features/preview/components/browser-tab-strip";
import { BrowserViewFrame } from "@/features/preview/components/browser-view-frame";
import { FeedbackOverlay } from "@/features/preview/components/feedback-overlay";
import { PreviewInteractionBar } from "@/features/preview/components/preview-interaction-bar";
import { PreviewNavigationBar } from "@/features/preview/components/preview-navigation-bar";
import { PreviewReviewTray } from "@/features/preview/components/preview-review-tray";
import {
  browserTabTitle,
  type PreviewBrowserTab,
} from "@/features/preview/preview-browser-tab";
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
import {
  type HostBrowserState,
  idleHostBrowserState,
} from "@/features/preview/state/browser-store";
import { idlePreviewSession } from "@/features/preview/state/preview-store";
import {
  useVibePadBrowserStore,
  useVibePadPreviewStore,
} from "@/lib/vibepad-host-context";

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

const httpUrlPattern = /^https?:\/\//iu;
const browserRefreshIntervalMs = 1500;

const ensureUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return httpUrlPattern.test(trimmed) ? trimmed : `http://${trimmed}`;
};

const previewTabFor = (
  target: BrowserTarget,
  active: boolean,
  canGoBack: boolean,
  canGoForward: boolean
): PreviewBrowserTab => ({
  draftUrl: target.url,
  id: target.id,
  loading: false,
  navigation: {
    canGoBack: active && canGoBack,
    canGoForward: active && canGoForward,
    url: target.url,
  },
  owner: "agent",
  sourceUrl: target.url,
  title: target.title || browserTabTitle(target.url),
});

const browserStatusMessage = (state: HostBrowserState, hostName: string) => {
  if (state.errorMessage) {
    return state.errorMessage;
  }
  if (state.available) {
    return `VibePad Browser on ${hostName} is not ready`;
  }
  return `VibePad Browser is not installed on ${hostName}`;
};

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
  const browser = useVibePadBrowserStore();
  const preview = useVibePadPreviewStore();
  const browserState = useValue(() => browser.state$.get());
  const { mode, review } = useValue(
    () => preview.state$.bySessionId[sessionId]?.get() ?? idlePreviewSession
  );
  const {
    activeTargetId,
    canGoBack,
    canGoForward,
    draftUrl,
    healthy,
    status,
    targetIds,
    targetsById,
    viewUrl,
  } = browserState ?? idleHostBrowserState;
  const tabs = useMemo(
    () =>
      targetIds.flatMap((targetId) => {
        const target = targetsById[targetId];
        return target
          ? [
              previewTabFor(
                target,
                targetId === activeTargetId,
                canGoBack,
                canGoForward
              ),
            ]
          : [];
      }),
    [activeTargetId, canGoBack, canGoForward, targetIds, targetsById]
  );
  const activeTab = tabs.find((tab) => tab.id === activeTargetId);

  useEffect(() => {
    browser.load().catch(() => undefined);
    const interval = setInterval(() => {
      browser.load(true).catch(() => undefined);
    }, browserRefreshIntervalMs);
    return () => {
      clearInterval(interval);
    };
  }, [browser]);

  useEffect(() => {
    preview.ensureSession(
      sessionId,
      activeTab?.navigation.url ?? "about:blank"
    );
  }, [activeTab?.navigation.url, preview, sessionId]);

  const openNewTab = useCallback(() => {
    browser.openTarget("https://www.google.com").catch(() => undefined);
  }, [browser]);
  const selectTab = useCallback(
    (targetId: string) => {
      browser.selectTarget(targetId).catch(() => undefined);
    },
    [browser]
  );
  const closeTab = useCallback(
    (targetId: string) => {
      browser.closeTarget(targetId).catch(() => undefined);
    },
    [browser]
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
      const cue: PreviewSelectionCue = {
        id: identity.id,
        kind: "selection",
        offsetMs: identity.offsetMs,
        point,
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

  const submitDraftUrl = useCallback(() => {
    const url = ensureUrl(draftUrl);
    if (url) {
      browser.act({ action: "navigate", url }).catch(() => undefined);
    }
  }, [browser, draftUrl]);
  const goBack = useCallback(() => {
    browser.act({ action: "back" }).catch(() => undefined);
  }, [browser]);
  const goForward = useCallback(() => {
    browser.act({ action: "forward" }).catch(() => undefined);
  }, [browser]);
  const reload = useCallback(() => {
    browser.act({ action: "reload" }).catch(() => undefined);
  }, [browser]);
  const openExternal = useCallback(() => {
    if (activeTab) {
      Linking.openURL(activeTab.navigation.url).catch(() => undefined);
    }
  }, [activeTab]);
  const changeDraftUrl = useCallback(
    (value: string) => {
      browser.setDraftUrl(value);
    },
    [browser]
  );
  const reconnectBrowser = useCallback(() => {
    browser.load(true).catch(() => undefined);
  }, [browser]);

  const cancelReview = useCallback(() => {
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
        cue.kind === "stroke" && cue.target.tabId === activeTargetId
          ? [{ id: cue.id, points: cue.points }]
          : []
      ),
    [activeTargetId, review.cues]
  );
  const selections = useMemo<readonly FeedbackSelectionPoint[]>(
    () =>
      review.cues.flatMap((cue) =>
        cue.kind === "selection" && cue.target.tabId === activeTargetId
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
    [activeTargetId, review.cues]
  );

  const browserMessage = browserStatusMessage(browserState, hostName);

  return (
    <View className="bg-background flex-1" testID="preview-surface">
      <BrowserTabStrip
        activeTabId={activeTargetId}
        onClose={closeTab}
        onNewTab={openNewTab}
        onSelect={selectTab}
        sessionId={sessionId}
        tabs={tabs}
      />
      <PreviewNavigationBar
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        draftUrl={draftUrl}
        expanded={expanded}
        hasActiveTab={Boolean(activeTab)}
        loading={status === "loading"}
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

      <View className="relative flex-1 overflow-hidden bg-black">
        {healthy && viewUrl ? (
          <BrowserViewFrame url={viewUrl} />
        ) : (
          <View className="bg-muted/20 flex-1 items-center justify-center gap-3">
            <Text className="max-w-md text-center text-sm" variant="muted">
              {browserMessage}
            </Text>
            {browserState.available ? (
              <Button onPress={reconnectBrowser} size="sm" variant="outline">
                <Icon name="rotate-ccw" size={13} />
                <Text>Reconnect</Text>
              </Button>
            ) : null}
          </View>
        )}
        {activeTab && healthy && viewUrl ? (
          <FeedbackOverlay
            mode={mode}
            onSelect={selectPoint}
            onStroke={addStroke}
            selections={selections}
            strokes={strokes}
          />
        ) : null}
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
