import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * False on the server and during hydration, then true. Native apps do not
 * hydrate, so it is true from the first render there.
 */
export const useHydrated = () =>
  useSyncExternalStore<boolean>(
    subscribe,
    () => true,
    () => false
  );
