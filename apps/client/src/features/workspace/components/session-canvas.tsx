import type { ModelReference } from "@vibepad/protocol/catalog";
import type {
  ProjectSummary,
  SessionSummary,
} from "@vibepad/protocol/provider";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type LayoutChangeEvent, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";
import { SessionComposer } from "@/features/composer/components/session-composer";
import { SessionInteractions } from "@/features/interactions/components/session-interactions";
import { ProviderControls } from "@/features/models/components/provider-controls";
import { ReviewCaptureStrip } from "@/features/preview/components/review-capture-strip";
import {
  buildPreviewFeedbackPrompt,
  emptyPreviewReviewDraft,
  type PreviewFeedbackCue,
} from "@/features/preview/preview-review";
import {
  useAppSettingsStore,
  useSettingsValue,
} from "@/features/settings/settings-context";
import { MessageScroller } from "@/features/timeline/components/message-scroller";
import {
  latestFinalAnswerAnchor,
  projectTimeline,
} from "@/features/timeline/model/timeline-projection";
import { DictationButton } from "@/features/voice/components/dictation-button";
import { DictationRecordingSurface } from "@/features/voice/components/dictation-recording-surface";
import { useSessionDictation } from "@/features/voice/use-session-dictation";
import { SessionWorkbench } from "@/features/workspace/components/session-workbench";
import type { SessionWorkbenchLayout } from "@/features/workspace/state/workspace-ui-store";
import {
  useProviderCatalog,
  useSessionInteractions,
  useSessionTimeline,
} from "@/lib/use-host-workspace";
import { useVibePadHost } from "@/lib/vibepad-host-context";

const splitWorkbenchBreakpoint = 820;
const endsWithWhitespace = /\s$/u;
const startsWithClosingPunctuation = /^[,.;:!?)]/u;
const startsWithWhitespace = /^\s/u;

interface DraftSelection {
  readonly end: number;
  readonly start: number;
}

const insertTranscript = (
  draft: string,
  selection: DraftSelection,
  transcript: string
) => {
  const start = Math.max(0, Math.min(selection.start, draft.length));
  const end = Math.max(start, Math.min(selection.end, draft.length));
  const before = draft.slice(0, start);
  const after = draft.slice(end);
  const leadingSpace =
    before &&
    !endsWithWhitespace.test(before) &&
    !startsWithClosingPunctuation.test(transcript)
      ? " "
      : "";
  const trailingSpace =
    after &&
    !startsWithWhitespace.test(after) &&
    !endsWithWhitespace.test(transcript)
      ? " "
      : "";
  const inserted = `${leadingSpace}${transcript}${trailingSpace}`;
  const value = `${before}${inserted}${after}`;
  const cursor = before.length + inserted.length;
  return { selection: { end: cursor, start: cursor }, value } as const;
};

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
  canSend,
  composerOverride,
  draft,
  errorMessage,
  footerLeading,
  footerTrailing,
  interactions,
  loading,
  onDraftChange,
  onDraftSelectionChange,
  onInterrupt,
  onRemoveReviewCue,
  onSend,
  reviewCues,
  sendError,
  sending,
  session,
  timeline,
}: {
  readonly active: boolean;
  readonly canSend: boolean;
  readonly composerOverride?: ReactNode;
  readonly draft: string;
  readonly errorMessage: string | undefined;
  readonly footerLeading: ReactNode;
  readonly footerTrailing: ReactNode;
  readonly interactions: ReturnType<typeof useSessionInteractions>;
  readonly loading: boolean;
  readonly onDraftChange: (value: string) => void;
  readonly onDraftSelectionChange: (selection: DraftSelection) => void;
  readonly onInterrupt: () => void;
  readonly onRemoveReviewCue: (cueId: string) => void;
  readonly onSend: () => void;
  readonly reviewCues: readonly PreviewFeedbackCue[];
  readonly sendError: string | undefined;
  readonly sending: boolean;
  readonly session: SessionSummary | undefined;
  readonly timeline: ReturnType<typeof useSessionTimeline>;
}) {
  const insets = useSafeAreaInsets();
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

      {session ? (
        <View
          className="border-border border-t bg-background px-3 pt-2 sm:px-6"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <SessionComposer
            attachments={
              reviewCues.length > 0 ? (
                <ReviewCaptureStrip
                  cues={reviewCues}
                  onRemoveCue={onRemoveReviewCue}
                />
              ) : undefined
            }
            canCancel={sending || timeline.running}
            canSend={canSend}
            className="mx-auto max-w-3xl"
            contentOverride={composerOverride}
            errorMessage={sendError}
            footerLeading={footerLeading}
            footerTrailing={footerTrailing}
            onCancel={onInterrupt}
            onChangeText={onDraftChange}
            onSelectionChange={onDraftSelectionChange}
            onSend={onSend}
            placeholder={
              reviewCues.length > 0
                ? "Add a note to these captures…"
                : "Ask anything…"
            }
            sending={sending}
            value={draft}
          />
        </View>
      ) : null}
    </View>
  );
}

function SessionProviderControls({
  catalogState,
  disabled,
  onSelectAgent,
  onSelectModel,
  project,
  session,
}: {
  readonly catalogState: ReturnType<typeof useProviderCatalog>;
  readonly disabled: boolean;
  readonly onSelectAgent: (agentId: string) => Promise<void>;
  readonly onSelectModel: (model: ModelReference) => Promise<void>;
  readonly project: ProjectSummary | undefined;
  readonly session: SessionSummary | undefined;
}) {
  const controls =
    session?.controls.status === "ready" ? session.controls : undefined;
  return (
    <ProviderControls
      agent={controls?.agent}
      catalog={catalogState.status === "ready" ? catalogState.data : undefined}
      catalogError={
        catalogState.status === "error" ? catalogState.message : undefined
      }
      controlLabel={project?.harnessId === "codex" ? "Mode" : "Agent"}
      controlsReady={Boolean(controls)}
      disabled={disabled || catalogState.status === "loading"}
      model={controls?.model}
      onSelectAgent={onSelectAgent}
      onSelectModel={onSelectModel}
    />
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
  const host = useVibePadHost();
  const voiceCleanup = useSettingsValue((state$) =>
    state$.settings.voice.cleanup.get()
  );
  const showInterimTranscript = useSettingsValue((state$) =>
    state$.settings.voice.showInterimTranscript.get()
  );
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [draft, setDraft] = useState("");
  const [draftSelection, setDraftSelection] = useState<DraftSelection>({
    end: 0,
    start: 0,
  });
  const [previewReview, setPreviewReview] = useState(emptyPreviewReviewDraft);
  const [previewUrl, setPreviewUrl] = useState("");
  const [sendError, setSendError] = useState<string | undefined>();
  const [interrupting, setInterrupting] = useState(false);
  const [sending, setSending] = useState(false);
  const timeline = useSessionTimeline(session?.id, active);
  const catalogState = useProviderCatalog(project?.id);
  const interactions = useSessionInteractions(session?.id, active);
  const canSend = Boolean(
    session &&
      !sending &&
      previewReview.pendingSelectionCount === 0 &&
      (draft.trim().length > 0 || previewReview.cues.length > 0)
  );
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
  const sendDraft = useCallback(
    async (draftValue: string) => {
      const note = draftValue.trim();
      const text =
        previewReview.cues.length > 0
          ? buildPreviewFeedbackPrompt(
              previewUrl || `http://${hostName}:8081`,
              note,
              previewReview.cues
            )
          : note;
      if (!(session && text)) {
        return;
      }
      setSending(true);
      setSendError(undefined);
      try {
        await host.sendTurn(session.id, text);
        setDraft("");
        setDraftSelection({ end: 0, start: 0 });
        setPreviewReview(emptyPreviewReviewDraft);
      } catch (error) {
        setSendError(
          error instanceof Error ? error.message : "Unable to send this turn"
        );
      } finally {
        setSending(false);
      }
    },
    [host, hostName, previewReview.cues, previewUrl, session]
  );
  const send = useCallback(async () => {
    await sendDraft(draft);
  }, [draft, sendDraft]);
  const applyTranscript = useCallback(
    async (transcript: string, sendAfterInsert: boolean) => {
      let editableTranscript = transcript;
      let cleanupWarning: string | undefined;
      if (voiceCleanup.enabled && voiceCleanup.model) {
        try {
          const result = await host.cleanupVoiceText({
            model: voiceCleanup.model,
            promptProfile: voiceCleanup.promptProfile,
            text: transcript,
          });
          editableTranscript = result.text;
        } catch (error) {
          const detail = error instanceof Error ? ` ${error.message}` : "";
          cleanupWarning = `AI cleanup was unavailable, so VibePad kept the raw transcript.${detail}`;
        }
      }
      const next = insertTranscript(draft, draftSelection, editableTranscript);
      setDraft(next.value);
      setDraftSelection(next.selection);
      if (sendAfterInsert) {
        await sendDraft(next.value);
      }
      if (cleanupWarning) {
        setSendError(cleanupWarning);
      }
    },
    [draft, draftSelection, host, sendDraft, voiceCleanup]
  );
  const {
    cancel: cancelDictationRequest,
    start: startDictationRequest,
    state: dictationState,
    stop: stopDictationRequest,
  } = useSessionDictation({
    onTranscript: applyTranscript,
    showInterimTranscript,
  });
  const cancelDictation = useCallback(() => {
    cancelDictationRequest().catch(() => undefined);
  }, [cancelDictationRequest]);
  const startDictation = useCallback(() => {
    startDictationRequest().catch(() => undefined);
  }, [startDictationRequest]);
  const stopDictation = useCallback(() => {
    stopDictationRequest(false).catch(() => undefined);
  }, [stopDictationRequest]);
  const sendDictation = useCallback(() => {
    stopDictationRequest(true).catch(() => undefined);
  }, [stopDictationRequest]);
  const previousSessionId = useRef(session?.id);
  useEffect(() => {
    if (previousSessionId.current === session?.id) {
      return;
    }
    previousSessionId.current = session?.id;
    cancelDictation();
    setDraft("");
    setDraftSelection({ end: 0, start: 0 });
  }, [cancelDictation, session?.id]);
  const removeReviewCue = useCallback((cueId: string) => {
    setPreviewReview((current) => ({
      ...current,
      cues: current.cues.filter((cue) => cue.id !== cueId),
    }));
  }, []);
  const interrupt = useCallback(async () => {
    if (!(session && !interrupting)) {
      return;
    }
    setInterrupting(true);
    setSendError(undefined);
    try {
      await host.interruptTurn(session.id);
      timeline.markTurnStopped();
      await interactions.refresh(false);
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Unable to stop this turn"
      );
    } finally {
      setInterrupting(false);
    }
  }, [host, interactions, interrupting, session, timeline]);
  const selectModel = useCallback(
    async (model: ModelReference) => {
      if (!session) {
        return;
      }
      onSessionChange(await host.selectModel(session.id, model));
    },
    [host, onSessionChange, session]
  );
  const selectAgent = useCallback(
    async (agentId: string) => {
      if (!session) {
        return;
      }
      onSessionChange(await host.selectAgent(session.id, agentId));
    },
    [host, onSessionChange, session]
  );
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
          canSend={canSend}
          composerOverride={
            dictationState.phase === "recording" ? (
              <DictationRecordingSurface
                interimText={dictationState.interimText}
                levels={dictationState.levels}
                onSend={sendDictation}
                onStop={stopDictation}
              />
            ) : undefined
          }
          draft={draft}
          errorMessage={errorMessage}
          footerLeading={
            <SessionProviderControls
              catalogState={catalogState}
              disabled={!session || sending || timeline.running}
              onSelectAgent={selectAgent}
              onSelectModel={selectModel}
              project={project}
              session={session}
            />
          }
          footerTrailing={
            <DictationButton
              disabled={!session || sending}
              onPress={startDictation}
              phase={dictationState.phase}
            />
          }
          interactions={interactions}
          loading={loading}
          onDraftChange={setDraft}
          onDraftSelectionChange={setDraftSelection}
          onInterrupt={interrupt}
          onRemoveReviewCue={removeReviewCue}
          onSend={send}
          reviewCues={previewReview.cues}
          sendError={sendError ?? dictationState.errorMessage}
          sending={sending}
          session={session}
          timeline={timeline}
        />
      </View>

      {session && project ? (
        <View
          className="min-h-0 min-w-0 flex-1 border-border border-l"
          style={{ display: workbench.open ? "flex" : "none" }}
        >
          <SessionWorkbench
            canSendReview={canSend}
            expanded={workbench.expanded && split}
            hostName={hostName}
            onClose={closeWorkbench}
            onReviewChange={setPreviewReview}
            onSendReview={send}
            onToggleExpanded={toggleWorkbenchExpanded}
            onUrlChange={setPreviewUrl}
            project={project}
            review={previewReview}
            sendError={sendError}
            sending={sending}
            sessionId={session.id}
            showPreviewReviewTray={hideChat}
            surface={workbench.surface}
          />
        </View>
      ) : null}
    </View>
  );
}
