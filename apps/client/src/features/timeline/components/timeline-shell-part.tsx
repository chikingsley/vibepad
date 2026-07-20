import type { TimelinePart } from "@vibepad/protocol/timeline";
import { ScrollView, View } from "react-native";

import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Text } from "@/components/ui/text";
import {
  TimelineActivityRow,
  TimelineDetailPanel,
} from "@/features/timeline/components/timeline-activity-row";
import { useTimelineDisclosure } from "@/features/timeline/timeline-disclosure-context";

type ShellPart = Extract<TimelinePart, { type: "shell" }>;

const ansiPattern = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  "g"
);

const shellTitle = (labelMode: "action" | "shell", active: boolean) => {
  if (labelMode === "shell") {
    return "Shell";
  }
  return active ? "Running" : "Ran";
};

export function TimelineShellPart({
  hideDetails = false,
  labelMode = "shell",
  part,
}: {
  readonly hideDetails?: boolean | undefined;
  readonly labelMode?: "action" | "shell" | undefined;
  readonly part: ShellPart;
}) {
  const { open, setOpen, toggle } = useTimelineDisclosure(`shell:${part.id}`);
  const active = part.status === "pending" || part.status === "running";
  const output = part.output
    .replace(ansiPattern, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
  const expandable =
    !hideDetails && Boolean(part.command || output || part.error);
  const title = shellTitle(labelMode, active);
  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <TimelineActivityRow
        accessibilityLabel={`${open ? "Hide" : "Show"} shell command`}
        expandable={expandable}
        icon="square"
        onPress={toggle}
        open={open}
        status={part.status}
        subtitle={part.summary ?? part.command}
        testID={`shell-part-${part.id}`}
        title={title}
      />
      <CollapsibleContent>
        <TimelineDetailPanel>
          <View className="border-border border-b px-3 py-2">
            <Text className="font-mono text-[11px] leading-5" selectable>
              $ {part.command}
            </Text>
          </View>
          {output ? (
            <ScrollView nestedScrollEnabled style={{ maxHeight: 360 }}>
              <Text
                className="px-3 py-2 font-mono text-[11px] leading-5"
                selectable
              >
                {output}
              </Text>
            </ScrollView>
          ) : null}
          {part.error ? (
            <Text className="border-border border-t px-3 py-2 text-red-600 text-xs">
              {part.error}
            </Text>
          ) : null}
          {part.exitCode === undefined ? null : (
            <Text
              className="border-border border-t px-3 py-1.5 text-[10px]"
              variant="muted"
            >
              Exit {part.exitCode}
              {part.durationMs === undefined ? "" : ` · ${part.durationMs} ms`}
            </Text>
          )}
        </TimelineDetailPanel>
      </CollapsibleContent>
    </Collapsible>
  );
}
