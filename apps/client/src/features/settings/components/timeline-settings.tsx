import type { TimelineOpeningPreference } from "@vibepad/protocol/settings";
import { useCallback } from "react";
import { View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { SettingsChoice } from "@/features/settings/components/settings-choice";
import {
  SettingsList,
  SettingsRow,
} from "@/features/settings/components/settings-row";
import {
  useAppSettingsStore,
  useSettingsValue,
} from "@/features/settings/settings-context";

export function TimelineSettings() {
  const { update } = useAppSettingsStore();
  const selectedOpening = useSettingsValue((state$) =>
    state$.settings.timeline.opening.get()
  );
  const selectOpening = useCallback(
    (opening: TimelineOpeningPreference) => {
      update((current) => ({
        ...current,
        timeline: { ...current.timeline, opening },
      }));
    },
    [update]
  );

  return (
    <View className="gap-6">
      <View className="gap-1">
        <Text className="text-xl font-semibold">Timeline</Text>
        <Text className="text-sm" variant="muted">
          Choose the point VibePad restores when a session opens or becomes
          active again.
        </Text>
      </View>

      <View className="gap-3">
        <Text
          className="text-xs font-medium tracking-wider uppercase"
          variant="muted"
        >
          Open sessions at
        </Text>
        <View
          accessibilityRole="radiogroup"
          className="flex-row flex-wrap gap-3"
        >
          <SettingsChoice
            description="Start at the latest completed assistant answer."
            label="Latest answer"
            onSelect={selectOpening}
            selected={selectedOpening === "latest-response"}
            testIdPrefix="timeline-opening"
            value="latest-response"
          />
          <SettingsChoice
            description="Return to the last stable message and reading offset."
            label="Last position"
            onSelect={selectOpening}
            selected={selectedOpening === "last-position"}
            testIdPrefix="timeline-opening"
            value="last-position"
          />
          <SettingsChoice
            description="Open directly at the newest event and follow the tail."
            label="Bottom"
            onSelect={selectOpening}
            selected={selectedOpening === "bottom"}
            testIdPrefix="timeline-opening"
            value="bottom"
          />
        </View>
      </View>

      <SettingsList>
        <SettingsRow
          description="VibePad stores a stable timeline item plus its relative reading offset for each session, rather than relying on a fragile absolute pixel position."
          title="Saved reading position"
        >
          <Badge variant="secondary">
            <Text>Per session</Text>
          </Badge>
        </SettingsRow>
      </SettingsList>
    </View>
  );
}
