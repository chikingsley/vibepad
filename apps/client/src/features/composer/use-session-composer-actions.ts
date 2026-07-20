import type { SessionSummary } from "@vibepad/protocol/provider";
import { useCallback } from "react";

import {
  buildPreviewFeedbackPrompt,
  emptyPreviewReviewDraft,
} from "@/features/preview/preview-review";
import type {
  useSessionInteractions,
  useSessionTimeline,
} from "@/lib/use-host-workspace";
import {
  useVibePadHost,
  useVibePadPreviewStore,
  useVibePadSessionComposerStore,
} from "@/lib/vibepad-host-context";

export function useSessionComposerActions({
  hostName,
  interactions,
  session,
  timeline,
}: {
  readonly hostName: string;
  readonly interactions: ReturnType<typeof useSessionInteractions>;
  readonly session: SessionSummary | undefined;
  readonly timeline: ReturnType<typeof useSessionTimeline>;
}) {
  const composer = useVibePadSessionComposerStore();
  const host = useVibePadHost();
  const preview = useVibePadPreviewStore();

  const sendDraft = useCallback(
    async (draftValue: string) => {
      if (!session) {
        return;
      }
      const review =
        preview.state$.bySessionId[session.id]?.review.peek() ??
        emptyPreviewReviewDraft;
      const note = draftValue.trim();
      const text =
        review.cues.length > 0
          ? buildPreviewFeedbackPrompt(
              preview.activeUrl(session.id) || `http://${hostName}:8081`,
              note,
              review.cues
            )
          : note;
      if (!(text && composer.beginSend(session.id))) {
        return;
      }
      try {
        await host.sendTurn(session.id, text);
        composer.completeSend(session.id, draftValue);
        preview.clearReview(session.id);
      } catch (error) {
        composer.failSend(
          session.id,
          error instanceof Error ? error.message : "Unable to send this turn"
        );
      }
    },
    [composer, host, hostName, preview, session]
  );
  const send = useCallback(async () => {
    if (session) {
      await sendDraft(composer.record(session.id).draft);
    }
  }, [composer, sendDraft, session]);
  const interrupt = useCallback(async () => {
    if (!(session && composer.beginInterrupt(session.id))) {
      return;
    }
    try {
      await host.interruptTurn(session.id);
      timeline.markTurnStopped();
      await interactions.refresh(false);
      composer.completeInterrupt(session.id);
    } catch (error) {
      composer.failInterrupt(
        session.id,
        error instanceof Error ? error.message : "Unable to stop this turn"
      );
    }
  }, [composer, host, interactions, session, timeline]);

  return { interrupt, send, sendDraft } as const;
}
