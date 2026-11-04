import type {
  TimelineFileChange,
  TimelinePart,
} from "@vibepad/protocol/timeline";
import { useMemo } from "react";
import { View } from "react-native";

import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Text } from "@/components/ui/text";
import {
  TimelineActivityRow,
  TimelineChangeStats,
  TimelineDetailPanel,
} from "@/features/timeline/components/timeline-activity-row";
import { TimelinePatch } from "@/features/timeline/components/timeline-patch";
import { useTimelineDisclosure } from "@/features/timeline/timeline-disclosure-context";

type FileChangePart = Extract<TimelinePart, { type: "file-change" }>;

const fileName = (path: string) =>
  path.split("/").filter(Boolean).at(-1) ?? path;

const directoryName = (path: string) => {
  const segments = path.split("/");
  segments.pop();
  const directory = segments.join("/");
  return directory || undefined;
};

const actionLabel = (action: TimelineFileChange["action"], active: boolean) => {
  if (action === "create") {
    return active ? "Creating" : "Created";
  }
  if (action === "delete") {
    return active ? "Deleting" : "Deleted";
  }
  if (action === "move") {
    return active ? "Moving" : "Moved";
  }
  return active ? "Editing" : "Edited";
};

const fileChangeTitle = (
  change: TimelineFileChange | undefined,
  active: boolean,
  count: number
) => {
  if (change) {
    return `${actionLabel(change.action, active)} ${fileName(change.path)}`;
  }
  if (active) {
    return "Changing files";
  }
  return `${count} files changed`;
};

const changePreviewMode = (
  change: TimelineFileChange
): "added" | "content" | "deleted" | "diff" => {
  if (change.patch) {
    return "diff";
  }
  if (change.action === "create") {
    return "added";
  }
  if (change.action === "delete") {
    return "deleted";
  }
  return "content";
};

function ChangePreview({ change }: { readonly change: TimelineFileChange }) {
  const preview = change.patch ?? change.content;
  return (
    <TimelineDetailPanel>
      <View className="border-border flex-row items-center gap-2 border-b px-3 py-2">
        <Text className="min-w-0 flex-1 text-[11px]" numberOfLines={1}>
          {change.previousPath
            ? `${change.previousPath} → ${change.path}`
            : change.path}
        </Text>
        <TimelineChangeStats
          additions={change.additions}
          deletions={change.deletions}
        />
      </View>
      {preview ? (
        <TimelinePatch content={preview} mode={changePreviewMode(change)} />
      ) : (
        <Text className="px-3 py-3 text-[11px]" variant="muted">
          This provider did not include an inline patch for the change.
        </Text>
      )}
    </TimelineDetailPanel>
  );
}

function FileChangeRow({
  change,
  partId,
}: {
  readonly change: TimelineFileChange;
  readonly partId: string;
}) {
  const disclosureId = `file:${partId}:${change.action}:${change.path}`;
  const { open, setOpen, toggle } = useTimelineDisclosure(disclosureId);
  const expandable = Boolean(change.patch ?? change.content);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <TimelineActivityRow
        accessibilityLabel={`${open ? "Hide" : "Show"} change to ${change.path}`}
        expandable={expandable}
        icon="file"
        onPress={toggle}
        open={open}
        right={
          <TimelineChangeStats
            additions={change.additions}
            deletions={change.deletions}
          />
        }
        status="completed"
        subtitle={change.previousPath ?? directoryName(change.path)}
        testID={`file-change-${partId}-${change.path}`}
        title={`${actionLabel(change.action, false)} ${fileName(change.path)}`}
      />
      <CollapsibleContent>
        <ChangePreview change={change} />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function TimelineFileChangePart({
  part,
}: {
  readonly part: FileChangePart;
}) {
  const { open, setOpen, toggle } = useTimelineDisclosure(
    `file-change:${part.id}`
  );
  const active = part.status === "pending" || part.status === "running";
  const totals = useMemo(
    () =>
      part.changes.reduce(
        (summary, change) => ({
          additions: summary.additions + change.additions,
          deletions: summary.deletions + change.deletions,
        }),
        { additions: 0, deletions: 0 }
      ),
    [part.changes]
  );
  const single = part.changes.length === 1 ? part.changes[0] : undefined;
  const expandable = part.changes.length > 0;
  const title = fileChangeTitle(single, active, part.changes.length);
  const subtitle = single
    ? (single.previousPath ?? directoryName(single.path))
    : undefined;

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <TimelineActivityRow
        accessibilityLabel={`${open ? "Hide" : "Show"} file changes`}
        expandable={expandable}
        icon="pencil"
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
        status={part.status}
        subtitle={subtitle}
        testID={`file-change-part-${part.id}`}
        title={title}
      />
      <CollapsibleContent>
        {single ? (
          <ChangePreview change={single} />
        ) : (
          <View className="border-border ml-7 gap-0.5 border-l pl-2">
            {part.changes.map((change) => (
              <FileChangeRow
                change={change}
                key={`${change.action}:${change.path}`}
                partId={part.id}
              />
            ))}
          </View>
        )}
        {part.error ? (
          <Text className="ml-7 px-3 py-2 text-xs text-red-600">
            {part.error}
          </Text>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
