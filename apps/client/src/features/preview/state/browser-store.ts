import { batch, type Observable, observable } from "@legendapp/state";
import type {
  BrowserState,
  BrowserTarget,
  BrowserTargetActionRequest,
} from "@vibepad/protocol/browser";

import type {
  BrowserViewConnection,
  VibePadHostClient,
} from "@/lib/vibepad-host";

interface BrowserHost {
  readonly closeBrowserTarget: VibePadHostClient["closeBrowserTarget"];
  readonly createBrowserTarget: VibePadHostClient["createBrowserTarget"];
  readonly createBrowserViewSession: VibePadHostClient["createBrowserViewSession"];
  readonly loadBrowser: VibePadHostClient["loadBrowser"];
  readonly performBrowserTargetAction: VibePadHostClient["performBrowserTargetAction"];
}

export interface HostBrowserState {
  activeTargetId: string | undefined;
  available: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  draftUrl: string;
  errorMessage: string | undefined;
  healthy: boolean;
  status: "error" | "idle" | "loading" | "ready";
  targetIds: string[];
  targetsById: Record<string, BrowserTarget>;
  viewExpiresAt: string | undefined;
  viewUrl: string | undefined;
}

export interface BrowserStore {
  readonly act: (
    action: BrowserTargetActionRequest,
    targetId?: string
  ) => Promise<void>;
  readonly cancelPending: () => void;
  readonly closeTarget: (targetId: string) => Promise<void>;
  readonly load: (refresh?: boolean) => Promise<void>;
  readonly openTarget: (url: string) => Promise<void>;
  readonly selectTarget: (targetId: string) => Promise<void>;
  readonly setDraftUrl: (url: string) => void;
  readonly state$: Observable<HostBrowserState>;
}

export const idleHostBrowserState: HostBrowserState = {
  activeTargetId: undefined,
  available: false,
  canGoBack: false,
  canGoForward: false,
  draftUrl: "",
  errorMessage: undefined,
  healthy: false,
  status: "idle",
  targetIds: [],
  targetsById: {},
  viewExpiresAt: undefined,
  viewUrl: undefined,
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to reach VibePad Browser";

const indexTargets = (targets: readonly BrowserTarget[]) =>
  Object.fromEntries(targets.map((target) => [target.id, target])) as Record<
    string,
    BrowserTarget
  >;

const viewNeedsRefresh = (state: HostBrowserState) =>
  !(state.viewUrl && state.viewExpiresAt) ||
  Date.parse(state.viewExpiresAt) - Date.now() < 2 * 60 * 1000;

export function createBrowserStore(host: BrowserHost): BrowserStore {
  const state$ = observable<HostBrowserState>({
    ...idleHostBrowserState,
    targetIds: [],
    targetsById: {},
  });
  let controller: AbortController | undefined;
  let revision = 0;

  const replaceBrowser = (
    browser: BrowserState,
    view: BrowserViewConnection | undefined
  ) => {
    const current = state$.peek();
    const activeTargetId = browser.activeTargetId ?? browser.targets[0]?.id;
    const activeTarget = browser.targets.find(
      (target) => target.id === activeTargetId
    );
    batch(() => {
      state$.activeTargetId.set(activeTargetId);
      state$.available.set(browser.available);
      state$.canGoBack.set(browser.canGoBack);
      state$.canGoForward.set(browser.canGoForward);
      state$.draftUrl.set(activeTarget?.url ?? current.draftUrl);
      state$.errorMessage.set(undefined);
      state$.healthy.set(browser.healthy);
      state$.status.set("ready");
      state$.targetIds.set(browser.targets.map(({ id }) => id));
      state$.targetsById.set(indexTargets(browser.targets));
      if (view) {
        state$.viewExpiresAt.set(view.expiresAt);
        state$.viewUrl.set(view.url);
      }
    });
  };

  const load = async (refresh = false) => {
    const current = state$.peek();
    if (!(refresh || current.status === "idle" || current.status === "error")) {
      return;
    }
    controller?.abort();
    controller = new AbortController();
    revision += 1;
    const requestRevision = revision;
    const requestController = controller;
    if (current.status !== "ready") {
      state$.status.set("loading");
    }
    try {
      const browser = await host.loadBrowser(requestController.signal);
      const view =
        browser.available && browser.healthy && viewNeedsRefresh(current)
          ? await host.createBrowserViewSession()
          : undefined;
      if (!requestController.signal.aborted && revision === requestRevision) {
        replaceBrowser(browser, view);
      }
    } catch (error) {
      if (!requestController.signal.aborted && revision === requestRevision) {
        batch(() => {
          state$.errorMessage.set(errorMessage(error));
          state$.status.set("error");
        });
      }
    }
  };

  const act = async (
    action: BrowserTargetActionRequest,
    targetId = state$.activeTargetId.peek()
  ) => {
    if (!targetId) {
      return;
    }
    await host.performBrowserTargetAction(targetId, action);
    if (action.action === "navigate") {
      state$.draftUrl.set(action.url);
    }
    await load(true);
  };

  return {
    act,
    cancelPending: () => {
      revision += 1;
      controller?.abort();
      if (state$.status.peek() === "loading") {
        state$.status.set("idle");
      }
    },
    closeTarget: async (targetId) => {
      await host.closeBrowserTarget(targetId);
      await load(true);
    },
    load,
    openTarget: async (url) => {
      const target = await host.createBrowserTarget(url);
      batch(() => {
        state$.activeTargetId.set(target.id);
        state$.draftUrl.set(target.url);
        state$.targetIds.set([...state$.targetIds.peek(), target.id]);
        state$.targetsById.assign({ [target.id]: target });
      });
    },
    selectTarget: async (targetId) => {
      await host.performBrowserTargetAction(targetId, { action: "activate" });
      const target = state$.targetsById[targetId]?.peek();
      batch(() => {
        state$.activeTargetId.set(targetId);
        state$.canGoBack.set(false);
        state$.canGoForward.set(false);
        if (target) {
          state$.draftUrl.set(target.url);
        }
      });
      await load(true);
    },
    setDraftUrl: (url) => {
      state$.draftUrl.set(url);
    },
    state$,
  };
}
