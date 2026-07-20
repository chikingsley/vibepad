import type { TimelinePart } from "@vibepad/protocol/timeline";

import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Text } from "@/components/ui/text";
import {
  TimelineActivityRow,
  TimelineDetailPanel,
} from "@/features/timeline/components/timeline-activity-row";
import { useTimelineDisclosure } from "@/features/timeline/timeline-disclosure-context";

type ReasoningPart = Extract<TimelinePart, { type: "reasoning" }>;

export function TimelineReasoningPart({
  part,
}: {
  readonly part: ReasoningPart;
}) {
  const { open, setOpen, toggle } = useTimelineDisclosure(
    `reasoning:${part.id}`
  );

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <TimelineActivityRow
        accessibilityLabel={`${open ? "Hide" : "Show"} reasoning summary`}
        expandable={Boolean(part.text)}
        icon="sparkles"
        onPress={toggle}
        open={open}
        status={part.text ? "completed" : "running"}
        testID={`reasoning-part-${part.id}`}
        title={part.text ? "Thought" : "Thinking"}
      />
      <CollapsibleContent>
        <TimelineDetailPanel>
          <Text
            className="px-3 py-2.5 text-[13px] leading-5"
            selectable
            variant="muted"
          >
            {part.text}
          </Text>
        </TimelineDetailPanel>
      </CollapsibleContent>
    </Collapsible>
  );
}
