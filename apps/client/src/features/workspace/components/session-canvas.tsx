import type {
  ProjectSummary,
  SessionSummary,
} from "@vibepad/protocol/provider";
import { useCallback, useMemo, useState } from "react";
import { type LayoutChangeEvent, View, type ViewStyle } from "react-native";

import { Text } from "@/components/ui/text";
import { SessionComposerDock } from "@/features/composer/components/session-composer-dock";
import { useSessionComposerActions } from "@/features/composer/use-session-composer-actions";
import { SessionInteractions } from "@/features/interactions/components/session-interactions";
import {
  useAppSettingsStore,
  useSettingsValue,
} from "@/features/settings/settings-context";
import { MessageScroller } from "@/features/timeline/components/message-scroller";
import {
  latestFinalAnswerAnchor,
  projectTimeline,
} from "@/features/timeline/model/timeline-projection";
import { SessionWorkbench } from "@/features/workspace/components/session-workbench";
import type { SessionWorkbenchLayout } from "@/features/workspace/state/workspace-ui-store";
import {
  useSessionInteractions,
  useSessionTimeline,
} from "@/lib/use-host-workspace";

const splitWorkbenchBreakpoint = 820;

function SessionContent({
  errorMessage,
  interactions,
  loading,
  session,
  timeline,
}: {
  readonly errorMessage: string | undefined;
  readonly interactions: ReturnType<typeof useSessionInteractions>;
  readonly loading: boolean;
  readonly session: SessionSummary | undefined;
  readonly timeline: ReturnType<typeof useSessionTimeline>;
}) {
  const timelineMatchesSession =
    timeline.status !== "idle" && timeline.sessionId === session?.id;
  if (loading) {
    return <Text variant="muted">Loading live projects and sessions…</Text>;
  }
  if (errorMessage) {
    return (
      <View className="rounded-xl border border-red-500/25 bg-red-500/5 p-4">
        <Text className="text-red-600 text-sm">{errorMessage}</Text>
      </View>
    );
  }
  if (!session) {
    return null;
  }
  return (
    <View className="gap-6">
      {interactions.state.status === "error" ? (
        <View className="rounded-xl border border-red-500/25 bg-red-500/5 p-4">
          <Text className="text-red-600 text-sm">
            {interactions.state.message}
          </Text>
        </View>
      ) : null}
      <SessionInteractions
        interactions={interactions.state.data}
        onResolved={interactions.refresh}
      />
      {timeline.status === "loading" && timelineMatchesSession ? (
        <Text variant="muted">Loading the live timeline…</Text>
      ) : null}
      {timeline.status === "error" && timelineMatchesSession ? (
        <View className="rounded-xl border border-red-500/25 bg-red-500/5 p-4">
          <Text className="text-red-600 text-sm">{timeline.message}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ChatSurface({
  active,
  errorMessage,
  interactions,
  loading,
  session,
  timeline,
}: {
  readonly active: boolean;
  readonly errorMessage: string | undefined;
  readonly interactions: ReturnType<typeof useSessionInteractions>;
  readonly loading: boolean;
  readonly session: SessionSummary | undefined;
  readonly timeline: ReturnType<typeof useSessionTimeline>;
}) {
  const { readMessageCheckpoint, writeMessageCheckpoint } =
    useAppSettingsStore();
  const openingPreference = useSettingsValue((state$) =>
    state$.settings.timeline.opening.get()
  );
  const timelineReady =
    timeline.status === "ready" && timeline.sessionId === session?.id;
  const timelinePage = timelineReady ? timeline.data : undefined;
  const blocks = useMemo(
    () => (timelinePage ? projectTimeline(timelinePage) : []),
    [timelinePage]
  );
  const initialAnchorId = useMemo(
    () => latestFinalAnswerAnchor(blocks),
    [blocks]
  );
  return (
    <View className="min-h-0 flex-1 bg-background" testID="session-chat">
      <MessageScroller
        active={active}
        blocks={blocks}
        harnessId={session?.harnessId}
        header={
          <SessionContent
            errorMessage={errorMessage}
            interactions={interactions}
            loading={loading}
            session={session}
            timeline={timeline}
          />
        }
        initialAnchorId={initialAnchorId}
        initialReady={timelineReady && blocks.length > 0}
        loadingOlder={timeline.loadingOlder}
        olderCursor={timelinePage?.olderCursor}
        olderLoadError={timeline.olderLoadError}
        onLoadOlder={timeline.loadOlder}
        openingPreference={openingPreference}
        readCheckpoint={readMessageCheckpoint}
        sessionId={session?.id}
        writeCheckpoint={writeMessageCheckpoint}
      />
    </View>
  );
}

export function SessionCanvas({
  active,
  errorMessage,
  hostName,
  loading,
  onCloseWorkbench,
  onSessionChange,
  onToggleWorkbenchExpanded,
  project,
  session,
  workbench,
}: {
  readonly active: boolean;
  readonly errorMessage: string | undefined;
  readonly hostName: string;
  readonly loading: boolean;
  readonly onCloseWorkbench: (sessionId: string) => void;
  readonly onSessionChange: (session: SessionSummary) => void;
  readonly onToggleWorkbenchExpanded: (sessionId: string) => void;
  readonly project: ProjectSummary | undefined;
  readonly session: SessionSummary | undefined;
  readonly workbench: SessionWorkbenchLayout;
}) {
  const [canvasWidth, setCanvasWidth] = useState(0);
  const timeline = useSessionTimeline(session?.id, active);
  const interactions = useSessionInteractions(session?.id, active);
  const { interrupt, send, sendDraft } = useSessionComposerActions({
    hostName,
    interactions,
    session,
    timeline,
  });
  const split = canvasWidth >= splitWorkbenchBreakpoint;
  const hideChat = workbench.open && (!split || workbench.expanded);
  let chatStyle: ViewStyle = { flex: 1 };
  if (hideChat) {
    chatStyle = { display: "none" };
  } else if (workbench.open && split) {
    chatStyle = { width: "38%" };
  }

  const measureCanvas = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setCanvasWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);
  const closeWorkbench = useCallback(() => {
    if (session) {
      onCloseWorkbench(session.id);
    }
  }, [onCloseWorkbench, session]);
  const toggleWorkbenchExpanded = useCallback(() => {
    if (session) {
      onToggleWorkbenchExpanded(session.id);
    }
  }, [onToggleWorkbenchExpanded, session]);
  return (
    <View
      className="min-h-0 flex-1 flex-row bg-background"
      onLayout={measureCanvas}
      testID={session ? "session-canvas" : "empty-session-canvas"}
    >
      <View className="min-h-0 min-w-0" style={chatStyle}>
        <ChatSurface
          active={active}
          errorMessage={errorMessage}
          interactions={interactions}
          loading={loading}
          session={session}
          timeline={timeline}
        />
        <SessionComposerDock
          onInterrupt={interrupt}
          onSend={send}
          onSendDraft={sendDraft}
          onSessionChange={onSessionChange}
          project={project}
          session={session}
          timelineRunning={timeline.running}
        />
      </View>

      {active && session && project && workbench.open ? (
        <View className="min-h-0 min-w-0 flex-1 border-border border-l">
          <SessionWorkbench
            expanded={workbench.expanded && split}
            hostName={hostName}
            onClose={closeWorkbench}
            onSendReview={send}
            onToggleExpanded={toggleWorkbenchExpanded}
            project={project}
            sessionId={session.id}
            showPreviewReviewTray={hideChat}
            surface={workbench.surface}
          />
        </View>
      ) : null}
    </View>
  );
}
