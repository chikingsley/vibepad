import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Linking,
  Platform,
  Pressable,
  TextInput,
  type TextInputSubmitEditingEvent,
  View,
} from "react-native";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { BrowserTabStrip } from "@/features/preview/components/browser-tab-strip";
import {
  FeedbackOverlay,
  type FeedbackPoint,
  type FeedbackSelectionPoint,
  type FeedbackStroke,
  type PreviewInteractionMode,
} from "@/features/preview/components/feedback-overlay";
import {
  type DomSelectionResult,
  PreviewFrame,
  type PreviewFrameHandle,
  type PreviewNavigationState,
} from "@/features/preview/components/preview-frame";
import { PreviewReviewTray } from "@/features/preview/components/preview-review-tray";
import {
  browserTabTitle,
  type PreviewBrowserTab,
  type PreviewBrowserTabOwner,
} from "@/features/preview/preview-browser-tab";
import type {
  PreviewReviewDraft,
  PreviewSelectionCue,
  PreviewStrokeCue,
} from "@/features/preview/preview-review";
import { cn } from "@/lib/utils";

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
  readonly onReviewChange: Dispatch<SetStateAction<PreviewReviewDraft>>;
  readonly onSendReview: () => void;
  readonly onToggleExpanded: () => void;
  readonly onUrlChange: (url: string) => void;
  readonly review: PreviewReviewDraft;
  readonly sending: boolean;
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

const createBrowserTab = (
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

function PreviewToolButton({
  accessibilityLabel,
  disabled = false,
  icon,
  onPress,
  testID,
}: {
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly icon: IconName;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      className="size-8 rounded-md"
      disabled={disabled}
      onPress={onPress}
      size="icon"
      testID={testID}
      variant="ghost"
    >
      <Icon className="text-muted-foreground" name={icon} size={14} />
    </Button>
  );
}

function InteractionModeButton({
  icon,
  label,
  mode,
  onSelect,
  selected,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly mode: PreviewInteractionMode;
  readonly onSelect: (mode: PreviewInteractionMode) => void;
  readonly selected: boolean;
}) {
  const select = useCallback(() => {
    onSelect(mode);
  }, [mode, onSelect]);

  return (
    <Pressable
      accessibilityLabel={`${label} preview mode`}
      className={cn(
        "h-8 flex-row items-center gap-1.5 rounded-md px-2.5 active:bg-accent",
        selected ? "bg-accent" : "bg-transparent"
      )}
      onPress={select}
      testID={`preview-mode-${mode}`}
    >
      <Icon
        className={selected ? "text-foreground" : "text-muted-foreground"}
        name={icon}
        size={13}
      />
      <Text className="text-[11px]">{label}</Text>
    </Pressable>
  );
}

function PreviewNavigationBar({
  canGoBack,
  canGoForward,
  draftUrl,
  expanded,
  hasActiveTab,
  loading,
  onBack,
  onClose,
  onDraftUrlChange,
  onForward,
  onOpenExternal,
  onReload,
  onSubmitDraftUrl,
  onToggleExpanded,
}: {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly draftUrl: string;
  readonly expanded: boolean;
  readonly hasActiveTab: boolean;
  readonly loading: boolean;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly onDraftUrlChange: (value: string) => void;
  readonly onForward: () => void;
  readonly onOpenExternal: () => void;
  readonly onReload: () => void;
  readonly onSubmitDraftUrl: (event: TextInputSubmitEditingEvent) => void;
  readonly onToggleExpanded: () => void;
}) {
  return (
    <View className="h-11 flex-row items-center gap-1 border-border border-b px-2">
      <PreviewToolButton
        accessibilityLabel="Preview back"
        disabled={!canGoBack}
        icon="chevron-left"
        onPress={onBack}
        testID="preview-back"
      />
      <PreviewToolButton
        accessibilityLabel="Preview forward"
        disabled={!canGoForward}
        icon="chevron-right"
        onPress={onForward}
        testID="preview-forward"
      />
      <PreviewToolButton
        accessibilityLabel="Reload preview"
        disabled={!hasActiveTab}
        icon="rotate-ccw"
        onPress={onReload}
        testID="preview-reload"
      />
      <View className="mx-1 h-8 min-w-40 flex-1 flex-row items-center rounded-md border border-border bg-card px-2">
        <TextInput
          accessibilityLabel="Preview URL"
          autoCapitalize="none"
          autoCorrect={false}
          className="min-w-0 flex-1 text-[12px] text-foreground outline-none"
          editable={hasActiveTab}
          onChangeText={onDraftUrlChange}
          onSubmitEditing={onSubmitDraftUrl}
          returnKeyType="go"
          testID="preview-url"
          value={draftUrl}
        />
        {loading ? (
          <Text className="text-[10px]" variant="muted">
            Loading…
          </Text>
        ) : null}
      </View>
      <PreviewToolButton
        accessibilityLabel="Open preview externally"
        disabled={!hasActiveTab}
        icon="external-link"
        onPress={onOpenExternal}
        testID="preview-open-external"
      />
      <PreviewToolButton
        accessibilityLabel={expanded ? "Restore split view" : "Expand preview"}
        icon={expanded ? "minimize-2" : "maximize-2"}
        onPress={onToggleExpanded}
        testID="session-workbench-expand"
      />
      <PreviewToolButton
        accessibilityLabel="Close preview"
        icon="x"
        onPress={onClose}
        testID="session-workbench-close"
      />
    </View>
  );
}

function PreviewInteractionBar({
  mode,
  onSelectMode,
}: {
  readonly mode: PreviewInteractionMode;
  readonly onSelectMode: (mode: PreviewInteractionMode) => void;
}) {
  return (
    <View className="h-11 flex-row items-center gap-1 border-border border-b px-2">
      <InteractionModeButton
        icon="browser"
        label="Interact"
        mode="browse"
        onSelect={onSelectMode}
        selected={mode === "browse"}
      />
      <InteractionModeButton
        icon="mouse-pointer"
        label="Select"
        mode="select"
        onSelect={onSelectMode}
        selected={mode === "select"}
      />
      <InteractionModeButton
        icon="pencil"
        label="Draw"
        mode="draw"
        onSelect={onSelectMode}
        selected={mode === "draw"}
      />
    </View>
  );
}

export function PreviewSurface({
  canSendReview,
  errorMessage,
  expanded,
  hostName,
  onClose,
  onReviewChange,
  onSendReview,
  onToggleExpanded,
  onUrlChange,
  review,
  sending,
  showReviewTray,
}: PreviewSurfaceProps) {
  const initialUrl = useMemo(() => defaultPreviewUrl(hostName), [hostName]);
  const frameRefs = useRef(new Map<string, PreviewFrameHandle>());
  const frameRefCallbacks = useRef(
    new Map<string, (handle: PreviewFrameHandle | null) => void>()
  );
  const pendingSelections = useRef(new Map<string, PendingSelection>());
  const reviewStartedAt = useRef<number | undefined>(undefined);
  const sequence = useRef(0);
  const tabSequence = useRef(1);
  const [tabs, setTabs] = useState<readonly PreviewBrowserTab[]>(() => [
    createBrowserTab("browser-tab-1", initialUrl, "page"),
  ]);
  const [activeTabId, setActiveTabId] = useState<string | undefined>(
    "browser-tab-1"
  );
  const [mode, setMode] = useState<PreviewInteractionMode>("browse");
  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  const updateTab = useCallback(
    (tabId: string, update: (tab: PreviewBrowserTab) => PreviewBrowserTab) => {
      setTabs((current) =>
        current.map((tab) => (tab.id === tabId ? update(tab) : tab))
      );
    },
    []
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
      tabSequence.current += 1;
      const id = `browser-tab-${tabSequence.current}`;
      const tab = createBrowserTab(id, url, owner);
      setTabs((current) => [...current, tab]);
      setActiveTabId(id);
    },
    []
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
  const selectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);
  const closeTab = useCallback(
    (tabId: string) => {
      const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
      if (closingIndex < 0) {
        return;
      }
      const remaining = tabs.filter((tab) => tab.id !== tabId);
      setTabs(remaining);
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
        onReviewChange((current) => ({
          ...current,
          pendingSelectionCount: pendingSelections.current.size,
        }));
      }

      if (activeTabId === tabId) {
        const nextIndex = Math.min(closingIndex, remaining.length - 1);
        setActiveTabId(nextIndex >= 0 ? remaining[nextIndex]?.id : undefined);
      }
      if (remaining.length === 0) {
        onClose();
      }
    },
    [activeTabId, onClose, onReviewChange, tabs]
  );

  useEffect(() => {
    if (activeTab) {
      onUrlChange(activeTab.navigation.url);
    }
  }, [activeTab, onUrlChange]);

  useEffect(() => {
    if (review.reviewing) {
      return;
    }
    pendingSelections.current.clear();
    reviewStartedAt.current = undefined;
  }, [review.reviewing]);

  const offsetForCue = useCallback(() => {
    if (!reviewStartedAt.current) {
      reviewStartedAt.current = Date.now();
      onReviewChange((current) => ({
        ...current,
        cues: [],
        reviewing: true,
      }));
      return 0;
    }
    return Date.now() - reviewStartedAt.current;
  }, [onReviewChange]);

  const addStroke = useCallback(
    (points: readonly FeedbackPoint[]) => {
      if (!activeTab) {
        return;
      }
      sequence.current += 1;
      const cue: PreviewStrokeCue = {
        id: `stroke-${sequence.current}`,
        kind: "stroke",
        offsetMs: offsetForCue(),
        points,
        target: {
          tabId: activeTab.id,
          url: activeTab.navigation.url,
        },
      };
      onReviewChange((current) => ({
        ...current,
        cues: [...current.cues, cue],
        reviewing: true,
      }));
    },
    [activeTab, offsetForCue, onReviewChange]
  );

  const selectPoint = useCallback(
    (point: FeedbackPoint) => {
      if (!activeTab) {
        return;
      }
      sequence.current += 1;
      const requestId = `selection-${sequence.current}`;
      pendingSelections.current.set(requestId, {
        offsetMs: offsetForCue(),
        point,
        target: {
          tabId: activeTab.id,
          url: activeTab.navigation.url,
        },
      });
      onReviewChange((current) => ({
        ...current,
        pendingSelectionCount: pendingSelections.current.size,
      }));
      frameRefs.current
        .get(activeTab.id)
        ?.selectAt({ requestId, x: point.x, y: point.y });
    },
    [activeTab, offsetForCue, onReviewChange]
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
      onReviewChange((current) => ({
        ...current,
        cues: [...current.cues, cue],
        pendingSelectionCount: pendingSelections.current.size,
      }));
    },
    [onReviewChange]
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

  const submitDraftUrl = useCallback(
    (_event: TextInputSubmitEditingEvent) => {
      loadDraftUrl();
    },
    [loadDraftUrl]
  );

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
    reviewStartedAt.current = undefined;
    onReviewChange({
      cues: [],
      pendingSelectionCount: 0,
      reviewing: false,
    });
  }, [onReviewChange]);

  const removeCue = useCallback(
    (cueId: string) => {
      onReviewChange((current) => ({
        ...current,
        cues: current.cues.filter((cue) => cue.id !== cueId),
      }));
    },
    [onReviewChange]
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

      <PreviewInteractionBar mode={mode} onSelectMode={setMode} />

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
