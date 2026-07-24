import { type Observable, observable } from "@legendapp/state";
import {
  type ComputerConnectionRecord,
  computerConnectionRecordSchema,
} from "@vibepad/protocol/onboarding";

export interface ComputerConnectionRegistryState {
  byHostId: Record<string, ComputerConnectionRecord>;
}

export interface ComputerConnectionRegistry {
  readonly remove: (hostId: string) => void;
  readonly set: (record: ComputerConnectionRecord) => void;
  readonly state$: Observable<ComputerConnectionRegistryState>;
}

export function createComputerConnectionRegistry(): ComputerConnectionRegistry {
  const state$ = observable<ComputerConnectionRegistryState>({ byHostId: {} });

  return {
    remove: (hostId) => state$.byHostId[hostId]?.delete(),
    set: (record) => {
      const parsed = computerConnectionRecordSchema.parse(record);
      state$.byHostId.assign({ [parsed.hostId]: parsed });
    },
    state$,
  };
}
