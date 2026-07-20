import { batch, type Observable, observable } from "@legendapp/state";

export type DictationPhase =
  | "connecting"
  | "failed"
  | "idle"
  | "processing"
  | "recording"
  | "requesting_permission";

export interface DictationRuntimeState {
  errorMessage: string | undefined;
  interimText: string;
  phase: DictationPhase;
}

export interface DictationRuntimeStore {
  readonly begin: () => boolean;
  readonly beginProcessing: () => boolean;
  readonly fail: (message: string) => void;
  readonly reset: () => void;
  readonly setInterimText: (text: string) => void;
  readonly setPhase: (phase: DictationPhase) => void;
  readonly state$: Observable<DictationRuntimeState>;
}

export const idleDictationRuntimeState: DictationRuntimeState = {
  errorMessage: undefined,
  interimText: "",
  phase: "idle",
};

export function createDictationRuntimeStore(): DictationRuntimeStore {
  const state$ = observable<DictationRuntimeState>({
    ...idleDictationRuntimeState,
  });

  return {
    begin: () => {
      const phase = state$.phase.peek();
      if (phase !== "idle" && phase !== "failed") {
        return false;
      }
      batch(() => {
        state$.errorMessage.set(undefined);
        state$.interimText.set("");
        state$.phase.set("requesting_permission");
      });
      return true;
    },
    beginProcessing: () => {
      if (state$.phase.peek() !== "recording") {
        return false;
      }
      state$.phase.set("processing");
      return true;
    },
    fail: (message) => {
      batch(() => {
        state$.errorMessage.set(message);
        state$.phase.set("failed");
      });
    },
    reset: () => {
      state$.set({ ...idleDictationRuntimeState });
    },
    setInterimText: (text) => {
      state$.interimText.set(text);
    },
    setPhase: (phase) => {
      state$.phase.set(phase);
    },
    state$,
  };
}
