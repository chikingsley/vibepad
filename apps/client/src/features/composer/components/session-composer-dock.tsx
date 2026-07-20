import { useValue } from "@legendapp/state/react";
import type { ModelReference } from "@vibepad/protocol/catalog";
import type {
  ProjectSummary,
  SessionSummary,
} from "@vibepad/protocol/provider";
import { useCallback, useEffect } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SessionComposer } from "@/features/composer/components/session-composer";
import type { DraftSelection } from "@/features/composer/state/session-composer-store";
import { ProviderControls } from "@/features/models/components/provider-controls";
import { ReviewCaptureStrip } from "@/features/preview/components/review-capture-strip";
import { emptyPreviewReviewDraft } from "@/features/preview/preview-review";
import { useSettingsValue } from "@/features/settings/settings-context";
import { DictationButton } from "@/features/voice/components/dictation-button";
import { DictationRecordingSurface } from "@/features/voice/components/dictation-recording-surface";
import { useSessionDictation } from "@/features/voice/use-session-dictation";
import { useProviderCatalog } from "@/lib/use-host-workspace";
import {
  useVibePadHost,
  useVibePadPreviewStore,
  useVibePadSessionComposerStore,
} from "@/lib/vibepad-host-context";

const endsWithWhitespace = /\s$/u;
const startsWithClosingPunctuation = /^[,.;:!?)]/u;
const startsWithWhitespace = /^\s/u;

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

function SessionProviderControls({
  disabled,
  onSessionChange,
  project,
  session,
}: {
  readonly disabled: boolean;
  readonly onSessionChange: (session: SessionSummary) => void;
  readonly project: ProjectSummary | undefined;
  readonly session: SessionSummary;
}) {
  const host = useVibePadHost();
  const catalogState = useProviderCatalog(project?.id);
  const controls =
    session.controls.status === "ready" ? session.controls : undefined;
  const selectModel = useCallback(
    async (model: ModelReference) => {
      onSessionChange(await host.selectModel(session.id, model));
    },
    [host, onSessionChange, session.id]
  );
  const selectAgent = useCallback(
    async (agentId: string) => {
      onSessionChange(await host.selectAgent(session.id, agentId));
    },
    [host, onSessionChange, session.id]
  );

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
      onSelectAgent={selectAgent}
      onSelectModel={selectModel}
    />
  );
}

export function SessionComposerDock({
  onInterrupt,
  onSend,
  onSendDraft,
  onSessionChange,
  project,
  session,
  timelineRunning,
}: {
  readonly onInterrupt: () => void;
  readonly onSend: () => void;
  readonly onSendDraft: (draft: string) => Promise<void>;
  readonly onSessionChange: (session: SessionSummary) => void;
  readonly project: ProjectSummary | undefined;
  readonly session: SessionSummary | undefined;
  readonly timelineRunning: boolean;
}) {
  const insets = useSafeAreaInsets();
  const composer = useVibePadSessionComposerStore();
  const host = useVibePadHost();
  const preview = useVibePadPreviewStore();
  const voiceCleanup = useSettingsValue((state$) =>
    state$.settings.voice.cleanup.get()
  );
  const showInterimTranscript = useSettingsValue((state$) =>
    state$.settings.voice.showInterimTranscript.get()
  );
  useEffect(() => {
    if (session) {
      composer.ensureSession(session.id);
    }
  }, [composer, session]);
  const composerState = useValue(() => {
    const state$ = session
      ? composer.state$.bySessionId[session.id]
      : undefined;
    return {
      draft: state$?.draft.get() ?? "",
      sendError: state$?.sendError.get(),
      sending: state$?.sending.get() ?? false,
    };
  });
  const previewReview = useValue(() => {
    const review$ = session
      ? preview.state$.bySessionId[session.id]?.review
      : undefined;
    return {
      cues: review$?.cues.get() ?? emptyPreviewReviewDraft.cues,
      pendingSelectionCount:
        review$?.pendingSelectionCount.get() ??
        emptyPreviewReviewDraft.pendingSelectionCount,
    };
  });
  const canSend = Boolean(
    session &&
      !composerState.sending &&
      previewReview.pendingSelectionCount === 0 &&
      (composerState.draft.trim().length > 0 || previewReview.cues.length > 0)
  );

  const applyTranscript = useCallback(
    async (transcript: string, sendAfterInsert: boolean) => {
      if (!session) {
        return;
      }
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
      const current = composer.record(session.id);
      const next = insertTranscript(
        current.draft,
        current.selection,
        editableTranscript
      );
      composer.setDraft(session.id, next.value);
      composer.setSelection(session.id, next.selection);
      if (sendAfterInsert) {
        await onSendDraft(next.value);
      }
      if (cleanupWarning) {
        composer.setError(session.id, cleanupWarning);
      }
    },
    [composer, host, onSendDraft, session, voiceCleanup]
  );
  const {
    cancel: cancelDictationRequest,
    start: startDictationRequest,
    state$: dictationState$,
    stop: stopDictationRequest,
    waveformLevels,
  } = useSessionDictation({
    onTranscript: applyTranscript,
    showInterimTranscript,
  });
  const dictationState = useValue(() => ({
    errorMessage: dictationState$.errorMessage.get(),
    phase: dictationState$.phase.get(),
  }));
  const startDictation = useCallback(() => {
    startDictationRequest().catch(() => undefined);
  }, [startDictationRequest]);
  const stopDictation = useCallback(() => {
    stopDictationRequest(false).catch(() => undefined);
  }, [stopDictationRequest]);
  const sendDictation = useCallback(() => {
    stopDictationRequest(true).catch(() => undefined);
  }, [stopDictationRequest]);
  useEffect(() => {
    if (!session?.id) {
      return;
    }
    return () => {
      cancelDictationRequest().catch(() => undefined);
    };
  }, [cancelDictationRequest, session?.id]);
  const changeDraft = useCallback(
    (value: string) => {
      if (session) {
        composer.setDraft(session.id, value);
      }
    },
    [composer, session]
  );
  const changeSelection = useCallback(
    (selection: DraftSelection) => {
      if (session) {
        composer.setSelection(session.id, selection);
      }
    },
    [composer, session]
  );
  const removeReviewCue = useCallback(
    (cueId: string) => {
      if (session) {
        preview.removeCue(session.id, cueId);
      }
    },
    [preview, session]
  );

  if (!session) {
    return null;
  }

  return (
    <View
      className="border-border border-t bg-background px-3 pt-2 sm:px-6"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <SessionComposer
        attachments={
          previewReview.cues.length > 0 ? (
            <ReviewCaptureStrip
              cues={previewReview.cues}
              onRemoveCue={removeReviewCue}
            />
          ) : undefined
        }
        canCancel={composerState.sending || timelineRunning}
        canSend={canSend}
        className="mx-auto max-w-3xl"
        contentOverride={
          dictationState.phase === "recording" ? (
            <DictationRecordingSurface
              levels={waveformLevels}
              onSend={sendDictation}
              onStop={stopDictation}
              state$={dictationState$}
            />
          ) : undefined
        }
        errorMessage={composerState.sendError ?? dictationState.errorMessage}
        footerLeading={
          <SessionProviderControls
            disabled={composerState.sending || timelineRunning}
            onSessionChange={onSessionChange}
            project={project}
            session={session}
          />
        }
        footerTrailing={
          <DictationButton
            disabled={composerState.sending}
            onPress={startDictation}
            phase={dictationState.phase}
          />
        }
        onCancel={onInterrupt}
        onChangeText={changeDraft}
        onSelectionChange={changeSelection}
        onSend={onSend}
        placeholder={
          previewReview.cues.length > 0
            ? "Add a note to these captures…"
            : "Ask anything…"
        }
        sending={composerState.sending}
        value={composerState.draft}
      />
    </View>
  );
}
