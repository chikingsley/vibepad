import { View } from "react-native";
import {
  type ContextPart,
  isContextPart,
  TimelineContextGroup,
} from "@/features/timeline/components/timeline-context-group";
import { TimelineFileChangePart } from "@/features/timeline/components/timeline-file-change-part";
import { TimelineReasoningPart } from "@/features/timeline/components/timeline-reasoning-part";
import { TimelineShellPart } from "@/features/timeline/components/timeline-shell-part";
import { TimelineToolPart } from "@/features/timeline/components/timeline-tool-part";
import type { TimelineActivityPart } from "@/features/timeline/model/timeline-parts";

type ActivityGroup =
  | {
      readonly id: string;
      readonly parts: readonly ContextPart[];
      readonly type: "context";
    }
  | {
      readonly part: TimelineActivityPart;
      readonly type: "part";
    };

const groupActivityParts = (
  parts: readonly TimelineActivityPart[]
): readonly ActivityGroup[] => {
  const groups: ActivityGroup[] = [];
  let context: ContextPart[] = [];
  const flushContext = () => {
    const [first] = context;
    if (first) {
      groups.push({ id: first.id, parts: context, type: "context" });
    }
    context = [];
  };

  for (const part of parts) {
    if (isContextPart(part)) {
      context.push(part);
      continue;
    }
    flushContext();
    groups.push({ part, type: "part" });
  }
  flushContext();
  return groups;
};

export function TimelineActivitySequence({
  labelMode = "shell",
  parts,
}: {
  readonly labelMode?: "action" | "shell" | undefined;
  readonly parts: readonly TimelineActivityPart[];
}) {
  return (
    <View className="gap-0.5">
      {groupActivityParts(parts).map((group) => {
        if (group.type === "context") {
          return <TimelineContextGroup key={group.id} parts={group.parts} />;
        }
        const { part } = group;
        if (part.type === "file-change") {
          return <TimelineFileChangePart key={part.id} part={part} />;
        }
        if (part.type === "reasoning") {
          return <TimelineReasoningPart key={part.id} part={part} />;
        }
        if (part.type === "shell") {
          return (
            <TimelineShellPart
              key={part.id}
              labelMode={labelMode}
              part={part}
            />
          );
        }
        return <TimelineToolPart key={part.id} part={part} />;
      })}
    </View>
  );
}
