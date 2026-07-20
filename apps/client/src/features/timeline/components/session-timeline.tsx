import type { HarnessId } from "@vibepad/protocol/provider";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { HarnessIcon } from "@/features/harness/components/harness-icon";
import { TimelineWorkLog } from "@/features/timeline/components/timeline-work-log";
import type { ProjectedTimelineBlock } from "@/features/timeline/model/timeline-projection";

function HarnessAvatar({ harnessId }: { readonly harnessId: HarnessId }) {
  return (
    <View className="mt-0.5 size-7 items-center justify-center rounded-lg bg-muted">
      <HarnessIcon
        className="text-foreground"
        harnessId={harnessId}
        size={15}
      />
    </View>
  );
}

function TimelineMessageContent({
  parts,
}: {
  readonly parts: Extract<ProjectedTimelineBlock, { type: "message" }>["parts"];
}) {
  return parts.map((part) => {
    if (part.type === "text") {
      return (
        <Text className="text-[15px] leading-6" key={part.id} selectable>
          {part.text}
        </Text>
      );
    }
    return (
      <View
        className="self-start rounded-lg border border-border bg-card px-3 py-2"
        key={part.id}
      >
        <Text className="text-xs">{part.name ?? part.uri}</Text>
        <Text className="text-[10px]" variant="muted">
          {part.mime}
        </Text>
      </View>
    );
  });
}

function TimelineMessage({
  block,
  harnessId,
}: {
  readonly block: Extract<ProjectedTimelineBlock, { type: "message" }>;
  readonly harnessId: HarnessId;
}) {
  if (block.itemKind === "notice" || block.itemKind === "compaction") {
    return (
      <View className="items-center py-1" testID={`timeline-item-${block.id}`}>
        <View className="max-w-[90%] rounded-full bg-muted px-3 py-1.5">
          <Text className="text-center text-[11px]" variant="muted">
            {block.parts.find((part) => part.type === "text")?.text}
          </Text>
        </View>
      </View>
    );
  }

  if (block.role === "user") {
    return (
      <View className="items-end" testID={`timeline-item-${block.id}`}>
        <View className="max-w-[88%] gap-2 rounded-2xl rounded-br-md bg-muted px-4 py-3">
          <TimelineMessageContent parts={block.parts} />
        </View>
      </View>
    );
  }

  return (
    <View
      className="flex-row items-start gap-3"
      testID={`timeline-item-${block.id}`}
    >
      <HarnessAvatar harnessId={harnessId} />
      <View className="min-w-0 flex-1 gap-2">
        <TimelineMessageContent parts={block.parts} />
      </View>
    </View>
  );
}

function TimelineBlockContent({
  block,
  harnessId,
}: {
  readonly block: ProjectedTimelineBlock;
  readonly harnessId: HarnessId;
}) {
  if (block.type === "activity") {
    return (
      <View
        className="flex-row items-start gap-3"
        testID={`timeline-activity-${block.id}`}
      >
        <HarnessAvatar harnessId={harnessId} />
        <View className="min-w-0 flex-1">
          <TimelineWorkLog
            completedAt={block.completedAt}
            createdAt={block.createdAt}
            id={block.id}
            parts={block.parts}
          />
        </View>
      </View>
    );
  }
  return <TimelineMessage block={block} harnessId={harnessId} />;
}

export function TimelineBlockRow({
  block,
  harnessId,
}: {
  readonly block: ProjectedTimelineBlock;
  readonly harnessId: HarnessId;
}) {
  return (
    <View className="mx-auto w-full max-w-3xl px-5 sm:px-8">
      <TimelineBlockContent
        block={block}
        harnessId={harnessId}
        key={block.id}
      />
    </View>
  );
}
