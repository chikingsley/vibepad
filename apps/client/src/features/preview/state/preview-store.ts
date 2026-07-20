import { batch, type Observable, observable } from "@legendapp/state";

import {
  createPreviewBrowserTab,
  type PreviewBrowserTab,
  type PreviewBrowserTabOwner,
} from "../preview-browser-tab";
import type { PreviewInteractionMode } from "../preview-interaction";
import {
  emptyPreviewReviewDraft,
  type PreviewReviewDraft,
} from "../preview-review";

export interface PreviewSessionState {
  activeTabId: string | undefined;
  mode: PreviewInteractionMode;
  nextCueSequence: number;
  nextTabSequence: number;
  review: PreviewReviewDraft;
  reviewStartedAt: number | null;
  tabs: readonly PreviewBrowserTab[];
}

export interface PreviewState {
  bySessionId: Record<string, PreviewSessionState>;
}

export interface PreviewCueIdentity {
  readonly id: string;
  readonly offsetMs: number;
}

type PreviewReviewUpdate =
  | PreviewReviewDraft
  | ((current: PreviewReviewDraft) => PreviewReviewDraft);

export interface PreviewStore {
  readonly activeUrl: (sessionId: string) => string | undefined;
  readonly clearPendingSelections: (sessionId: string, count: number) => void;
  readonly clearReview: (sessionId: string) => void;
  readonly closeTab: (sessionId: string, tabId: string) => number;
  readonly ensureSession: (sessionId: string, initialUrl: string) => void;
  readonly openTab: (
    sessionId: string,
    url: string,
    owner: PreviewBrowserTabOwner
  ) => string | undefined;
  readonly removeCue: (sessionId: string, cueId: string) => void;
  readonly selectTab: (sessionId: string, tabId: string) => void;
  readonly setMode: (sessionId: string, mode: PreviewInteractionMode) => void;
  readonly startCue: (
    sessionId: string,
    kind: "selection" | "stroke",
    now?: number
  ) => PreviewCueIdentity | undefined;
  readonly state$: Observable<PreviewState>;
  readonly updateReview: (
    sessionId: string,
    update: PreviewReviewUpdate
  ) => void;
  readonly updateTab: (
    sessionId: string,
    tabId: string,
    update: (tab: PreviewBrowserTab) => PreviewBrowserTab
  ) => void;
}

export const idlePreviewSession: PreviewSessionState = {
  activeTabId: undefined,
  mode: "browse",
  nextCueSequence: 0,
  nextTabSequence: 0,
  review: emptyPreviewReviewDraft,
  reviewStartedAt: null,
  tabs: [],
};

const createPreviewSession = (initialUrl: string): PreviewSessionState => ({
  activeTabId: "browser-tab-1",
  mode: "browse",
  nextCueSequence: 0,
  nextTabSequence: 1,
  review: emptyPreviewReviewDraft,
  reviewStartedAt: null,
  tabs: [createPreviewBrowserTab("browser-tab-1", initialUrl, "page")],
});

export function createPreviewStore(): PreviewStore {
  const state$ = observable<PreviewState>({ bySessionId: {} });
  const read = (sessionId: string) => state$.bySessionId[sessionId]?.peek();
  const record$ = (sessionId: string) => state$.bySessionId[sessionId];

  const updateReview = (sessionId: string, update: PreviewReviewUpdate) => {
    const session$ = record$(sessionId);
    if (!session$) {
      return;
    }
    const current = session$.review.peek();
    session$.review.set(
      typeof update === "function" ? update(current) : update
    );
  };

  return {
    activeUrl: (sessionId) => {
      const current = read(sessionId);
      return current?.tabs.find((tab) => tab.id === current.activeTabId)
        ?.navigation.url;
    },
    clearPendingSelections: (sessionId, count) => {
      if (count <= 0) {
        return;
      }
      updateReview(sessionId, (current) => ({
        ...current,
        pendingSelectionCount: Math.max(
          0,
          current.pendingSelectionCount - count
        ),
      }));
    },
    clearReview: (sessionId) => {
      const session$ = record$(sessionId);
      if (!session$) {
        return;
      }
      batch(() => {
        session$.review.set(emptyPreviewReviewDraft);
        session$.reviewStartedAt.set(null);
      });
    },
    closeTab: (sessionId, tabId) => {
      const session$ = record$(sessionId);
      const current = read(sessionId);
      if (!(session$ && current)) {
        return 0;
      }
      const closingIndex = current.tabs.findIndex((tab) => tab.id === tabId);
      if (closingIndex < 0) {
        return current.tabs.length;
      }
      const remaining = current.tabs.filter((tab) => tab.id !== tabId);
      batch(() => {
        session$.tabs.set(remaining);
        if (current.activeTabId === tabId) {
          const nextIndex = Math.min(closingIndex, remaining.length - 1);
          session$.activeTabId.set(
            nextIndex >= 0 ? remaining[nextIndex]?.id : undefined
          );
        }
      });
      return remaining.length;
    },
    ensureSession: (sessionId, initialUrl) => {
      if (!read(sessionId)) {
        state$.bySessionId.assign({
          [sessionId]: createPreviewSession(initialUrl),
        });
      }
    },
    openTab: (sessionId, url, owner) => {
      const session$ = record$(sessionId);
      const current = read(sessionId);
      if (!(session$ && current)) {
        return;
      }
      const nextSequence = current.nextTabSequence + 1;
      const id = `browser-tab-${nextSequence}`;
      batch(() => {
        session$.nextTabSequence.set(nextSequence);
        session$.tabs.set([
          ...current.tabs,
          createPreviewBrowserTab(id, url, owner),
        ]);
        session$.activeTabId.set(id);
      });
      return id;
    },
    removeCue: (sessionId, cueId) => {
      const session$ = record$(sessionId);
      if (!session$) {
        return;
      }
      const current = session$.review.peek();
      const cues = current.cues.filter((cue) => cue.id !== cueId);
      if (cues.length === 0 && current.pendingSelectionCount === 0) {
        batch(() => {
          session$.review.set(emptyPreviewReviewDraft);
          session$.reviewStartedAt.set(null);
        });
        return;
      }
      session$.review.set({ ...current, cues });
    },
    selectTab: (sessionId, tabId) => {
      const session$ = record$(sessionId);
      const current = read(sessionId);
      if (session$ && current?.tabs.some((tab) => tab.id === tabId)) {
        session$.activeTabId.set(tabId);
      }
    },
    setMode: (sessionId, mode) => {
      record$(sessionId)?.mode.set(mode);
    },
    startCue: (sessionId, kind, now = Date.now()) => {
      const session$ = record$(sessionId);
      const current = read(sessionId);
      if (!(session$ && current)) {
        return;
      }
      const nextSequence = current.nextCueSequence + 1;
      const startedAt = current.review.reviewing
        ? (current.reviewStartedAt ?? now)
        : now;
      batch(() => {
        session$.nextCueSequence.set(nextSequence);
        session$.reviewStartedAt.set(startedAt);
        if (!current.review.reviewing) {
          session$.review.set({
            cues: [],
            pendingSelectionCount: 0,
            reviewing: true,
          });
        }
      });
      return {
        id: `${kind}-${nextSequence}`,
        offsetMs: now - startedAt,
      };
    },
    state$,
    updateReview,
    updateTab: (sessionId, tabId, update) => {
      const session$ = record$(sessionId);
      const current = read(sessionId);
      if (!(session$ && current)) {
        return;
      }
      session$.tabs.set(
        current.tabs.map((tab) => (tab.id === tabId ? update(tab) : tab))
      );
    },
  };
}
