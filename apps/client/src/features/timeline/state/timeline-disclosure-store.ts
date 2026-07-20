import { type Observable, observable } from "@legendapp/state";

export interface TimelineDisclosureState {
  bySessionId: Record<string, Record<string, boolean>>;
}

export interface TimelineDisclosureStore {
  readonly clearSession: (sessionId: string) => void;
  readonly isOpen: (sessionId: string, disclosureId: string) => boolean;
  readonly setOpen: (
    sessionId: string,
    disclosureId: string,
    open: boolean
  ) => void;
  readonly state$: Observable<TimelineDisclosureState>;
  readonly toggle: (sessionId: string, disclosureId: string) => void;
}

export function createTimelineDisclosureStore(): TimelineDisclosureStore {
  const state$ = observable<TimelineDisclosureState>({ bySessionId: {} });
  const isOpen = (sessionId: string, disclosureId: string) =>
    state$.bySessionId[sessionId]?.[disclosureId]?.peek() ?? false;

  const setOpen = (sessionId: string, disclosureId: string, open: boolean) => {
    const session$ = state$.bySessionId[sessionId];
    if (!session$?.peek()) {
      state$.bySessionId.assign({
        [sessionId]: { [disclosureId]: open },
      });
      return;
    }
    session$.assign({ [disclosureId]: open });
  };

  return {
    clearSession: (sessionId) => {
      state$.bySessionId[sessionId]?.delete();
    },
    isOpen,
    setOpen,
    state$,
    toggle: (sessionId, disclosureId) => {
      setOpen(sessionId, disclosureId, !isOpen(sessionId, disclosureId));
    },
  };
}
