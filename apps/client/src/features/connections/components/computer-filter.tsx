import { useEffect } from "react";
import { AppState, ScrollView } from "react-native";

import {
  HostSelectorItem,
  useSetActiveHost,
} from "@/features/connections/components/host-selector";
import { runSavedComputerChecks } from "@/features/connections/computer-connection-checks";
import { useSettingsValue } from "@/features/settings/settings-context";

export function ComputerFilter() {
  const connections = useSettingsValue((state$) =>
    state$.settings.connections.get()
  );
  const setActiveHost = useSetActiveHost();

  useEffect(() => {
    runSavedComputerChecks(connections.hosts, connections.activeHostId).catch(
      () => undefined
    );
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runSavedComputerChecks(
          connections.hosts,
          connections.activeHostId
        ).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [connections.activeHostId, connections.hosts]);

  return (
    <ScrollView
      className="max-h-12"
      contentContainerClassName="gap-2 px-3 py-1.5"
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="computer-filter"
    >
      {connections.hosts.map((host) => (
        <HostSelectorItem
          active={host.id === connections.activeHostId}
          host={host}
          key={host.id}
          onSelect={setActiveHost}
          variant="chip"
        />
      ))}
    </ScrollView>
  );
}
