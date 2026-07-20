import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import type { HarnessId } from "@vibepad/protocol/provider";
import {
  type MessageScrollCheckpoint,
  messageScrollCheckpointSchemaVersion,
  type TimelineOpeningPreference,
} from "@vibepad/protocol/settings";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  View,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { TimelineBlockRow } from "@/features/timeline/components/session-timeline";
import {
  isMessageScrollDetached,
  messageAnchorOffset,
} from "@/features/timeline/model/message-scroll-state";
import type { ProjectedTimelineBlock } from "@/features/timeline/model/timeline-projection";

const tailThreshold = 96;
const checkpointDelay = 280;
const timelineInset = 16;
const listStyle = { flex: 1 } as const;
const listContentStyle = { paddingBottom: 40, paddingTop: 32 } as const;
const listHeaderStyle = { marginBottom: 24 } as const;

interface OpeningPlan {
  readonly atEnd: boolean;
  readonly generation: number;
  readonly index?:
    | {
        readonly index: number;
        readonly viewOffset: number;
      }
    | undefined;
  readonly sessionId: string;
}

const timelineBlockKey = (block: ProjectedTimelineBlock) => block.id;

const timelineBlockType = (block: ProjectedTimelineBlock) =>
  block.type === "activity"
    ? "activity"
    : `message:${block.role}:${block.itemKind}`;

const timelineBlocksEqual = (
  previous: ProjectedTimelineBlock,
  current: ProjectedTimelineBlock
) => {
  if (
    previous.id !== current.id ||
    previous.type !== current.type ||
    previous.completedAt !== current.completedAt ||
    previous.createdAt !== current.createdAt ||
    previous.itemKind !== current.itemKind ||
    previous.parts.length !== current.parts.length ||
    !previous.parts.every((part, index) => part === current.parts[index])
  ) {
    return false;
  }
  if (previous.type === "activity" && current.type === "activity") {
    return previous.turnId === current.turnId;
  }
  return (
    previous.type === "message" &&
    current.type === "message" &&
    previous.phase === current.phase &&
    previous.role === current.role &&
    previous.turnId === current.turnId
  );
};

function TimelineItemSeparator() {
  return <View className="h-5" />;
}

function EarlierTimelineControl({
  error,
  loading,
  onLoad,
}: {
  readonly error: string | undefined;
  readonly loading: boolean;
  readonly onLoad: () => Promise<void>;
}) {
  const handleLoad = useCallback(() => {
    onLoad().catch(() => undefined);
  }, [onLoad]);

  return (
    <View className="items-center gap-2">
      <Button
        accessibilityLabel="Show earlier timeline messages"
        className="rounded-full px-4"
        disabled={loading}
        onPress={handleLoad}
        size="sm"
        testID="timeline-show-earlier"
        variant="outline"
      >
        <Text className="text-xs" variant="muted">
          {loading ? "Loading earlier messages…" : "Show earlier messages"}
        </Text>
      </Button>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-center text-red-600 text-xs"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function MessageScroller({
  active,
  blocks,
  harnessId,
  header,
  initialAnchorId,
  initialReady,
  loadingOlder,
  olderCursor,
  olderLoadError,
  onLoadOlder,
  openingPreference,
  readCheckpoint,
  sessionId,
  writeCheckpoint,
}: {
  readonly active: boolean;
  readonly blocks: readonly ProjectedTimelineBlock[];
  readonly harnessId: HarnessId | undefined;
  readonly header: ReactNode;
  readonly initialAnchorId: string | undefined;
  readonly initialReady: boolean;
  readonly loadingOlder: boolean;
  readonly olderCursor: string | undefined;
  readonly olderLoadError: string | undefined;
  readonly onLoadOlder: () => Promise<void>;
  readonly openingPreference: TimelineOpeningPreference;
  readonly readCheckpoint: (
    sessionId: string
  ) => Promise<MessageScrollCheckpoint | undefined>;
  readonly sessionId: string | undefined;
  readonly writeCheckpoint: (
    sessionId: string,
    checkpoint: MessageScrollCheckpoint
  ) => Promise<void>;
}) {
  const listRef = useRef<LegendListRef>(null);
  const activeSession = useRef<string | undefined>(undefined);
  const checkpointTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const firstVisibleKey = useRef<string | undefined>(undefined);
  const latestBlocks = useRef(blocks);
  const openingGeneration = useRef(0);
  const plannedGeneration = useRef<number | undefined>(undefined);
  const previousActive = useRef(false);
  const previousOpeningPreference = useRef<
    TimelineOpeningPreference | undefined
  >(undefined);
  const previousSessionId = useRef<string | undefined>(undefined);
  const [detached, setDetached] = useState(false);
  const [openingPlan, setOpeningPlan] = useState<OpeningPlan | null>(null);
  latestBlocks.current = blocks;

  const persistCheckpoint = useCallback(() => {
    const currentSessionId = activeSession.current;
    const key = firstVisibleKey.current;
    const state = listRef.current?.getState();
    if (!(currentSessionId && key && state)) {
      return;
    }
    const position = state.positionByKey(key);
    if (position === undefined) {
      return;
    }
    writeCheckpoint(currentSessionId, {
      anchorId: key,
      offset: Math.max(0, state.scroll - messageAnchorOffset(position)),
      savedAt: Date.now(),
      schemaVersion: messageScrollCheckpointSchemaVersion,
    }).catch(() => undefined);
  }, [writeCheckpoint]);

  const scheduleCheckpoint = useCallback(() => {
    if (checkpointTimer.current) {
      clearTimeout(checkpointTimer.current);
    }
    checkpointTimer.current = setTimeout(() => {
      checkpointTimer.current = undefined;
      persistCheckpoint();
    }, checkpointDelay);
  }, [persistCheckpoint]);

  useEffect(() => {
    const becameActive = active && !previousActive.current;
    const becameInactive = !active && previousActive.current;
    const sessionChanged = previousSessionId.current !== sessionId;
    const preferenceChanged =
      previousOpeningPreference.current !== openingPreference;

    if (becameInactive || sessionChanged || preferenceChanged) {
      persistCheckpoint();
    }
    previousActive.current = active;
    previousSessionId.current = sessionId;
    previousOpeningPreference.current = openingPreference;
    activeSession.current = sessionId;

    if (!(becameActive || sessionChanged || preferenceChanged)) {
      return;
    }
    openingGeneration.current += 1;
    plannedGeneration.current = undefined;
    firstVisibleKey.current = undefined;
    setDetached(false);
    setOpeningPlan(null);
  }, [active, openingPreference, persistCheckpoint, sessionId]);

  useEffect(() => {
    if (!(active && initialReady && sessionId)) {
      return;
    }
    const generation = openingGeneration.current;
    if (plannedGeneration.current === generation) {
      return;
    }
    plannedGeneration.current = generation;

    const prepare = async () => {
      const checkpoint =
        openingPreference === "last-position"
          ? await readCheckpoint(sessionId).catch(() => undefined)
          : undefined;
      if (openingGeneration.current !== generation) {
        return;
      }
      const currentBlocks = latestBlocks.current;
      const targetId = checkpoint?.anchorId ?? initialAnchorId;
      const index = targetId
        ? currentBlocks.findIndex(({ id }) => id === targetId)
        : -1;
      const atEnd = openingPreference === "bottom" || index < 0;
      setOpeningPlan({
        atEnd,
        generation,
        ...(atEnd
          ? {}
          : {
              index: {
                index,
                viewOffset: timelineInset - (checkpoint?.offset ?? 0),
              },
            }),
        sessionId,
      });
    };
    prepare().catch(() => undefined);
  }, [
    active,
    initialAnchorId,
    initialReady,
    openingPreference,
    readCheckpoint,
    sessionId,
  ]);

  useEffect(
    () => () => {
      openingGeneration.current += 1;
      if (checkpointTimer.current) {
        clearTimeout(checkpointTimer.current);
      }
      persistCheckpoint();
    },
    [persistCheckpoint]
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!active) {
        return;
      }
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      setDetached(
        isMessageScrollDetached(
          {
            contentSize: contentSize.height,
            offset: contentOffset.y,
            viewportSize: layoutMeasurement.height,
          },
          tailThreshold
        )
      );
      scheduleCheckpoint();
    },
    [active, scheduleCheckpoint]
  );

  const handleFirstVisibleItemChanged = useCallback(
    ({ key }: { readonly key: string }) => {
      firstVisibleKey.current = key;
    },
    []
  );

  const handleJumpToLatest = useCallback(() => {
    setDetached(false);
    listRef.current?.scrollToEnd({ animated: true }).catch(() => undefined);
  }, []);

  const renderItem = useCallback(
    ({ item }: { readonly item: ProjectedTimelineBlock }) =>
      harnessId ? (
        <TimelineBlockRow block={item} harnessId={harnessId} />
      ) : null,
    [harnessId]
  );

  const listHeader = useMemo(
    () => (
      <View className="mx-auto w-full max-w-3xl gap-6 px-5 sm:px-8">
        {header}
        {olderCursor ? (
          <EarlierTimelineControl
            error={olderLoadError}
            loading={loadingOlder}
            onLoad={onLoadOlder}
          />
        ) : null}
      </View>
    ),
    [header, loadingOlder, olderCursor, olderLoadError, onLoadOlder]
  );

  const validOpeningPlan =
    openingPlan?.sessionId === sessionId ? openingPlan : null;
  const listData = initialReady && !validOpeningPlan ? [] : blocks;
  let initialScrollProps:
    | { readonly initialScrollAtEnd: true }
    | { readonly initialScrollIndex: NonNullable<OpeningPlan["index"]> }
    | Record<string, never> = {};
  if (validOpeningPlan?.atEnd) {
    initialScrollProps = { initialScrollAtEnd: true };
  } else if (validOpeningPlan?.index) {
    initialScrollProps = { initialScrollIndex: validOpeningPlan.index };
  }
  const platformListProps =
    Platform.OS === "web"
      ? {}
      : {
          keyboardDismissMode: "interactive" as const,
          onMomentumScrollEnd: persistCheckpoint,
          onScrollEndDrag: persistCheckpoint,
          testID: "message-scroll-view",
        };

  return (
    <View className="min-h-0 flex-1" testID="message-scroller">
      <LegendList
        contentContainerStyle={listContentStyle}
        data={listData}
        dataKey={sessionId ?? "empty"}
        estimatedItemSize={80}
        extraData={harnessId}
        getItemType={timelineBlockType}
        {...initialScrollProps}
        ItemSeparatorComponent={TimelineItemSeparator}
        itemsAreEqual={timelineBlocksEqual}
        key={`${sessionId ?? "empty"}:${validOpeningPlan?.generation ?? "loading"}`}
        keyExtractor={timelineBlockKey}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={listHeaderStyle}
        maintainScrollAtEnd={{
          animated: false,
          on: { dataChange: true, itemLayout: true, layout: true },
        }}
        maintainScrollAtEndThreshold={0.1}
        maintainVisibleContentPosition={{ data: true, size: true }}
        onFirstVisibleItemChanged={handleFirstVisibleItemChanged}
        onScroll={handleScroll}
        recycleItems
        ref={listRef}
        renderItem={renderItem}
        scrollEventThrottle={16}
        style={listStyle}
        {...platformListProps}
      />

      {detached ? (
        <View
          className="pointer-events-none absolute inset-x-0 bottom-4 items-center"
          testID="jump-to-latest-container"
        >
          <Button
            accessibilityLabel="Jump to latest"
            className="pointer-events-auto size-9 rounded-full bg-background shadow-lg"
            onPress={handleJumpToLatest}
            size="icon"
            testID="jump-to-latest"
            variant="outline"
          >
            <Icon name="chevron-down" size={16} />
          </Button>
        </View>
      ) : null}
    </View>
  );
}
