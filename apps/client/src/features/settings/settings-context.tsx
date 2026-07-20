import type {
  AppSettings,
  MessageScrollCheckpoint,
} from "@vibepad/protocol/settings";
import { createDefaultAppSettings } from "@vibepad/protocol/settings";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { settingsStorage } from "./storage/settings-storage";

type SettingsPersistenceState = "error" | "loading" | "ready" | "saving";

interface AppSettingsController {
  readonly errorMessage: string | undefined;
  readonly persistenceState: SettingsPersistenceState;
  readonly readMessageCheckpoint: (
    sessionId: string
  ) => Promise<MessageScrollCheckpoint | undefined>;
  readonly reset: () => void;
  readonly settings: AppSettings;
  readonly update: (update: (current: AppSettings) => AppSettings) => void;
  readonly writeMessageCheckpoint: (
    sessionId: string,
    checkpoint: MessageScrollCheckpoint
  ) => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsController | undefined>(
  undefined
);

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to save settings";

export function AppSettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState(createDefaultAppSettings);
  const [persistenceState, setPersistenceState] =
    useState<SettingsPersistenceState>("loading");
  const [persistenceError, setPersistenceError] = useState<
    string | undefined
  >();
  const mounted = useRef(true);
  const writeRevision = useRef(0);
  const writeQueue = useRef(Promise.resolve());

  useEffect(() => {
    mounted.current = true;
    settingsStorage
      .readSettings()
      .then((stored) => {
        if (!(mounted.current && writeRevision.current === 0)) {
          return;
        }
        setSettings(stored);
        setPersistenceState("ready");
      })
      .catch((error: unknown) => {
        if (!(mounted.current && writeRevision.current === 0)) {
          return;
        }
        setPersistenceError(errorMessage(error));
        setPersistenceState("error");
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const persist = useCallback((next: AppSettings) => {
    const revision = writeRevision.current + 1;
    writeRevision.current = revision;
    setPersistenceError(undefined);
    setPersistenceState("saving");
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(() => settingsStorage.writeSettings(next));
    writeQueue.current
      .then(() => {
        if (mounted.current && writeRevision.current === revision) {
          setPersistenceState("ready");
        }
      })
      .catch((error: unknown) => {
        if (mounted.current && writeRevision.current === revision) {
          setPersistenceError(errorMessage(error));
          setPersistenceState("error");
        }
      });
  }, []);

  const update = useCallback(
    (transform: (current: AppSettings) => AppSettings) => {
      setSettings((current) => {
        const next = transform(current);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const reset = useCallback(() => {
    const next = createDefaultAppSettings();
    setSettings(next);
    persist(next);
  }, [persist]);

  const value = useMemo<AppSettingsController>(
    () => ({
      errorMessage: persistenceError,
      persistenceState,
      readMessageCheckpoint: settingsStorage.readMessageCheckpoint,
      reset,
      settings,
      update,
      writeMessageCheckpoint: settingsStorage.writeMessageCheckpoint,
    }),
    [persistenceError, persistenceState, reset, settings, update]
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export const useAppSettings = () => {
  const value = useContext(AppSettingsContext);
  if (!value) {
    throw new Error("useAppSettings must be used inside AppSettingsProvider");
  }
  return value;
};
