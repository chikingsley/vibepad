import type { TimelinePart } from "@vibepad/protocol/timeline";
import { View } from "react-native";

import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import type { IconName } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  TimelineActivityRow,
  TimelineDetailPanel,
} from "@/features/timeline/components/timeline-activity-row";
import { useTimelineDisclosure } from "@/features/timeline/timeline-disclosure-context";

type ToolPart = Extract<TimelinePart, { type: "tool" }>;

const formatDetail = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

const hasDetail = (value: unknown) =>
  value !== null &&
  value !== undefined &&
  !(typeof value === "string" && value.length === 0);

const toolPresentation = (part: ToolPart) => {
  if (part.action === "read") {
    return { icon: "file" as IconName, title: "Read" };
  }
  if (part.action === "list") {
    return { icon: "folder" as IconName, title: "Listed" };
  }
  if (part.action === "search") {
    return { icon: "search" as IconName, title: "Searched" };
  }
  if (part.action === "web-search") {
    return { icon: "browser" as IconName, title: "Searched web" };
  }
  if (part.category === "agent") {
    return { icon: "sparkles" as IconName, title: "Delegated" };
  }
  if (part.category === "mcp") {
    return { icon: "opencode-status" as IconName, title: "Called" };
  }
  return { icon: "sparkles" as IconName, title: "Called" };
};

function ToolDetail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: unknown;
}) {
  return (
    <View className="gap-1.5 px-3 py-2.5">
      <Text
        className="font-medium text-[10px] uppercase tracking-wider"
        variant="muted"
      >
        {label}
      </Text>
      <Text className="font-mono text-[11px] leading-4" selectable>
        {formatDetail(value)}
      </Text>
    </View>
  );
}

export function TimelineToolPart({
  hideDetails = false,
  part,
}: {
  readonly hideDetails?: boolean | undefined;
  readonly part: ToolPart;
}) {
  const { open, setOpen, toggle } = useTimelineDisclosure(`tool:${part.id}`);
  const presentation = toolPresentation(part);
  const expandable =
    !hideDetails &&
    (hasDetail(part.input) ||
      hasDetail(part.output) ||
      hasDetail(part.error) ||
      hasDetail(part.metadata));
  const subtitle = part.target ?? part.name;

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <TimelineActivityRow
        accessibilityLabel={`${open ? "Hide" : "Show"} ${part.name} tool details`}
        expandable={expandable}
        icon={presentation.icon}
        onPress={toggle}
        open={open}
        status={part.status}
        subtitle={subtitle}
        testID={`tool-part-${part.id}`}
        title={presentation.title}
      />
      <CollapsibleContent>
        <TimelineDetailPanel>
          <ToolDetail label="Input" value={part.input} />
          {hasDetail(part.output) ? (
            <View className="border-border border-t">
              <ToolDetail label="Output" value={part.output} />
            </View>
          ) : null}
          {hasDetail(part.metadata) ? (
            <View className="border-border border-t">
              <ToolDetail label="Provider details" value={part.metadata} />
            </View>
          ) : null}
          {part.error ? (
            <View className="border-border border-t">
              <ToolDetail label="Error" value={part.error} />
            </View>
          ) : null}
        </TimelineDetailPanel>
      </CollapsibleContent>
    </Collapsible>
  );
}
