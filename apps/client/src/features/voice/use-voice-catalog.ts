import { useValue } from "@legendapp/state/react";
import { useEffect } from "react";

import { useVibePadVoiceCatalogStore } from "@/lib/vibepad-host-context";

export function useVoiceCatalog() {
  const catalog = useVibePadVoiceCatalogStore();

  useEffect(() => {
    catalog.load().catch(() => undefined);
  }, [catalog]);

  return useValue(catalog.state$);
}
