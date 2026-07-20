import type { TimelinePart } from "@vibepad/protocol/timeline";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { TimelineActivityRow } from "@/features/timeline/components/timeline-activity-row";
import { TimelineShellPart } from "@/features/timeline/components/timeline-shell-part";
import { TimelineToolPart } from "@/features/timeline/components/timeline-tool-part";

type ContextToolPart = Extract<TimelinePart, { type: "tool" }> & {
  readonly category: "context";
};

type ContextShellPart = Extract<TimelinePart, { type: "shell" }> & {
  readonly action: "list" | "read" | "search";
};

export type ContextPart = ContextShellPart | ContextToolPart;

export const isContextPart = (part: TimelinePart): part is ContextPart =>
  (part.type === "tool" && part.category === "context") ||
  (part.type === "shell" &&
    (part.action === "list" ||
      part.action === "read" ||
      part.action === "search"));

const countLabel = (count: number, one: string, many: string) =>
  count > 0 ? `${count} ${count === 1 ? one : many}` : undefined;

export function TimelineContextGroup({
  parts,
}: {
  readonly parts: readonly ContextPart[];
}) {
  const [open, setOpen] = useState(false);
  const active = parts.some(
    (part) => part.status === "pending" || part.status === "running"
  );
  const summary = useMemo(() => {
    let reads = 0;
    let searches = 0;
    let lists = 0;
    for (const part of parts) {
      const { action } = part;
      if (action === "read") {
        reads += 1;
      } else if (action === "list") {
        lists += 1;
      } else if (action === "search" || action === "web-search") {
        searches += 1;
      }
    }
    return [
      countLabel(reads, "read", "reads"),
      countLabel(searches, "search", "searches"),
      countLabel(lists, "list", "lists"),
    ]
      .filter(Boolean)
      .join(", ");
  }, [parts]);
  const toggle = useCallback(() => setOpen((value) => !value), []);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <TimelineActivityRow
        accessibilityLabel={`${open ? "Hide" : "Show"} gathered context`}
        expandable={parts.length > 0}
        icon="search"
        onPress={toggle}
        open={open}
        status={active ? "running" : "completed"}
        subtitle={summary}
        testID={`context-tool-group-${parts[0]?.id ?? "empty"}`}
        title={active ? "Gathering context" : "Gathered context"}
      />
      <CollapsibleContent>
        <View className="ml-7 gap-0.5 border-border border-l pl-2">
          {parts.map((part) =>
            part.type === "shell" ? (
              <TimelineShellPart
                hideDetails
                key={part.id}
                labelMode="action"
                part={part}
              />
            ) : (
              <TimelineToolPart hideDetails key={part.id} part={part} />
            )
          )}
        </View>
      </CollapsibleContent>
    </Collapsible>
  );
}
