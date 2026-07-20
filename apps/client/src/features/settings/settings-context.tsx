import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
} from "react";

import {
  createSettingsStore,
  type SettingsStore,
  type SettingsStoreState,
} from "./state/settings-store";
import { settingsStorage } from "./storage/settings-storage";

const AppSettingsContext = createContext<SettingsStore | undefined>(undefined);

export function AppSettingsProvider({ children }: PropsWithChildren) {
  const storeRef = useRef<SettingsStore | undefined>(undefined);
  storeRef.current ??= createSettingsStore(settingsStorage);
  const store = storeRef.current;

  useEffect(() => {
    store.load().catch(() => undefined);
    return store.cancelPending;
  }, [store]);

  return (
    <AppSettingsContext.Provider value={store}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export const useAppSettingsStore = () => {
  const store = useContext(AppSettingsContext);
  if (!store) {
    throw new Error(
      "useAppSettingsStore must be used inside AppSettingsProvider"
    );
  }
  return store;
};

export const useSettingsValue = <T,>(
  selector: (state$: Observable<SettingsStoreState>) => T
) => {
  const store = useAppSettingsStore();
  return useValue(() => selector(store.state$));
};
