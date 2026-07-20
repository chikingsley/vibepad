import { useValue } from "@legendapp/state/react";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
} from "react";

import { useVibePadTimelineDisclosureStore } from "@/lib/vibepad-host-context";

const TimelineSessionContext = createContext<string | undefined>(undefined);

export function TimelineDisclosureScope({
  children,
  sessionId,
}: PropsWithChildren<{ readonly sessionId: string | undefined }>) {
  return (
    <TimelineSessionContext.Provider value={sessionId}>
      {children}
    </TimelineSessionContext.Provider>
  );
}

export function useTimelineDisclosure(disclosureId: string) {
  const sessionId = useContext(TimelineSessionContext);
  const store = useVibePadTimelineDisclosureStore();
  if (!sessionId) {
    throw new Error(
      "useTimelineDisclosure must be used inside TimelineDisclosureScope"
    );
  }
  const open = useValue(
    () => store.state$.bySessionId[sessionId]?.[disclosureId]?.get() ?? false
  );
  const setOpen = useCallback(
    (value: boolean) => {
      store.setOpen(sessionId, disclosureId, value);
    },
    [disclosureId, sessionId, store]
  );
  const toggle = useCallback(() => {
    store.toggle(sessionId, disclosureId);
  }, [disclosureId, sessionId, store]);

  return { open, setOpen, toggle } as const;
}
