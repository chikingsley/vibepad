import { useMemo } from "react";
import { View } from "react-native";

import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  TimelineActivityRow,
  TimelineChangeStats,
} from "@/features/timeline/components/timeline-activity-row";
import { TimelineActivitySequence } from "@/features/timeline/components/timeline-activity-sequence";
import { isContextPart } from "@/features/timeline/components/timeline-context-group";
import type { TimelineActivityPart } from "@/features/timeline/model/timeline-parts";
import { useTimelineDisclosure } from "@/features/timeline/timeline-disclosure-context";

const countPhrase = (count: number, singular: string, plural: string) =>
  count > 0 ? `${count} ${count === 1 ? singular : plural}` : undefined;

interface ActivityCounts {
  commands: number;
  created: number;
  deleted: number;
  edited: number;
  lists: number;
  reads: number;
  searches: number;
  tools: number;
}

const fileCounts = (
  part: Extract<TimelineActivityPart, { type: "file-change" }>
) => {
  const counts = { created: 0, deleted: 0, edited: 0 };
  for (const { action } of part.changes) {
    if (action === "create") {
      counts.created += 1;
    } else if (action === "delete") {
      counts.deleted += 1;
    } else {
      counts.edited += 1;
    }
  }
  return counts;
};

const activityCounts = (
  parts: readonly TimelineActivityPart[]
): ActivityCounts => {
  const counts: ActivityCounts = {
    commands: 0,
    created: 0,
    deleted: 0,
    edited: 0,
    lists: 0,
    reads: 0,
    searches: 0,
    tools: 0,
  };

  for (const part of parts) {
    if (part.type === "file-change") {
      const files = fileCounts(part);
      counts.created += files.created;
      counts.deleted += files.deleted;
      counts.edited += files.edited;
    } else if (isContextPart(part)) {
      if (part.action === "read") {
        counts.reads += 1;
      } else if (part.action === "list") {
        counts.lists += 1;
      } else {
        counts.searches += 1;
      }
    } else if (part.type === "shell") {
      counts.commands += 1;
    } else if (part.type === "tool") {
      counts.tools += 1;
    }
  }
  return counts;
};

const activitySummary = (parts: readonly TimelineActivityPart[]) => {
  const counts = activityCounts(parts);
  return [
    countPhrase(counts.created, "file created", "files created"),
    countPhrase(counts.edited, "file edited", "files edited"),
    countPhrase(counts.deleted, "file deleted", "files deleted"),
    countPhrase(counts.reads, "file read", "files read"),
    countPhrase(counts.searches, "search", "searches"),
    countPhrase(counts.lists, "listing", "listings"),
    countPhrase(counts.commands, "command run", "commands run"),
    countPhrase(counts.tools, "tool called", "tools called"),
  ]
    .filter(Boolean)
    .join(", ");
};

const formatDuration = (durationMs: number | undefined) => {
  if (durationMs === undefined || durationMs < 1000) {
    return;
  }
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${minutes}m`;
};

const workTitle = (
  active: boolean,
  failed: boolean,
  duration: string | undefined
) => {
  if (active) {
    return "Working";
  }
  if (failed) {
    return "Work failed";
  }
  return duration ? `Worked for ${duration}` : "Worked";
};

const workStatus = (active: boolean, failed: boolean) => {
  if (failed) {
    return "error" as const;
  }
  return active ? ("running" as const) : ("completed" as const);
};

export function TimelineWorkLog({
  completedAt,
  createdAt,
  id,
  parts,
}: {
  readonly completedAt: string | undefined;
  readonly createdAt: string;
  readonly id: string;
  readonly parts: readonly TimelineActivityPart[];
}) {
  const { open, setOpen, toggle } = useTimelineDisclosure(`work-log:${id}`);
  const active = parts.some(
    (part) =>
      "status" in part &&
      (part.status === "pending" || part.status === "running")
  );
  const failed = parts.some(
    (part) => "status" in part && part.status === "error"
  );
  const totals = useMemo(
    () =>
      parts.reduce(
        (summary, part) => {
          if (part.type !== "file-change") {
            return summary;
          }
          for (const change of part.changes) {
            summary.additions += change.additions;
            summary.deletions += change.deletions;
          }
          return summary;
        },
        { additions: 0, deletions: 0 }
      ),
    [parts]
  );
  const duration = completedAt
    ? formatDuration(Date.parse(completedAt) - Date.parse(createdAt))
    : undefined;
  const title = workTitle(active, failed, duration);
  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <TimelineActivityRow
        accessibilityLabel={`${open ? "Hide" : "Show"} work log`}
        expandable={parts.length > 0}
        icon="sparkles"
        onPress={toggle}
        open={open}
        right={
          active ? null : (
            <TimelineChangeStats
              additions={totals.additions}
              deletions={totals.deletions}
            />
          )
        }
        status={workStatus(active, failed)}
        subtitle={activitySummary(parts)}
        testID={`timeline-work-log-${id}`}
        title={title}
      />
      <CollapsibleContent>
        <View className="border-border ml-7 border-l pl-2">
          <TimelineActivitySequence labelMode="action" parts={parts} />
        </View>
      </CollapsibleContent>
    </Collapsible>
  );
}
