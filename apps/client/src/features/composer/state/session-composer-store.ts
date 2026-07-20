import { batch, type Observable, observable } from "@legendapp/state";

export interface DraftSelection {
  readonly end: number;
  readonly start: number;
}

export interface SessionComposerRecord {
  draft: string;
  interrupting: boolean;
  selection: DraftSelection;
  sendError: string | undefined;
  sending: boolean;
}

export interface SessionComposerState {
  bySessionId: Record<string, SessionComposerRecord>;
}

export interface SessionComposerStore {
  readonly beginInterrupt: (sessionId: string) => boolean;
  readonly beginSend: (sessionId: string) => boolean;
  readonly clearSession: (sessionId: string) => void;
  readonly completeInterrupt: (sessionId: string) => void;
  readonly completeSend: (sessionId: string, submittedDraft: string) => void;
  readonly ensureSession: (sessionId: string) => void;
  readonly failInterrupt: (sessionId: string, message: string) => void;
  readonly failSend: (sessionId: string, message: string) => void;
  readonly record: (sessionId: string) => SessionComposerRecord;
  readonly setDraft: (sessionId: string, draft: string) => void;
  readonly setError: (sessionId: string, message: string | undefined) => void;
  readonly setSelection: (sessionId: string, selection: DraftSelection) => void;
  readonly state$: Observable<SessionComposerState>;
}

export const idleSessionComposer: SessionComposerRecord = {
  draft: "",
  interrupting: false,
  selection: { end: 0, start: 0 },
  sendError: undefined,
  sending: false,
};

const createSessionComposer = (): SessionComposerRecord => ({
  ...idleSessionComposer,
  selection: { ...idleSessionComposer.selection },
});

export function createSessionComposerStore(): SessionComposerStore {
  const state$ = observable<SessionComposerState>({ bySessionId: {} });
  const ensureSession = (sessionId: string) => {
    if (!state$.bySessionId[sessionId]?.peek()) {
      state$.bySessionId.assign({ [sessionId]: createSessionComposer() });
    }
  };
  const record$ = (sessionId: string) => {
    ensureSession(sessionId);
    const value$ = state$.bySessionId[sessionId];
    if (!value$) {
      throw new Error("Legend did not create the session composer record");
    }
    return value$;
  };
  const record = (sessionId: string) =>
    state$.bySessionId[sessionId]?.peek() ?? idleSessionComposer;

  return {
    beginInterrupt: (sessionId) => {
      const current = record(sessionId);
      if (current.interrupting) {
        return false;
      }
      const value$ = record$(sessionId);
      batch(() => {
        value$.interrupting.set(true);
        value$.sendError.set(undefined);
      });
      return true;
    },
    beginSend: (sessionId) => {
      const current = record(sessionId);
      if (current.sending) {
        return false;
      }
      const value$ = record$(sessionId);
      batch(() => {
        value$.sending.set(true);
        value$.sendError.set(undefined);
      });
      return true;
    },
    clearSession: (sessionId) => {
      state$.bySessionId[sessionId]?.delete();
    },
    completeInterrupt: (sessionId) => {
      record$(sessionId).interrupting.set(false);
    },
    completeSend: (sessionId, submittedDraft) => {
      const value$ = record$(sessionId);
      batch(() => {
        value$.sending.set(false);
        if (value$.draft.peek() === submittedDraft) {
          value$.draft.set("");
          value$.selection.set({ end: 0, start: 0 });
        }
      });
    },
    ensureSession,
    failInterrupt: (sessionId, message) => {
      const value$ = record$(sessionId);
      batch(() => {
        value$.interrupting.set(false);
        value$.sendError.set(message);
      });
    },
    failSend: (sessionId, message) => {
      const value$ = record$(sessionId);
      batch(() => {
        value$.sending.set(false);
        value$.sendError.set(message);
      });
    },
    record,
    setDraft: (sessionId, draft) => {
      record$(sessionId).draft.set(draft);
    },
    setError: (sessionId, message) => {
      record$(sessionId).sendError.set(message);
    },
    setSelection: (sessionId, selection) => {
      record$(sessionId).selection.set(selection);
    },
    state$,
  };
}
