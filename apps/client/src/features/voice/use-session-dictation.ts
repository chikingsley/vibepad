import { realtimeVoiceEventSchema } from "@vibepad/protocol/voice";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSettings } from "@/features/settings/settings-context";
import {
  normalizeLinear16,
  type PcmAudioBuffer,
  pcmLevel,
} from "@/features/voice/pcm";
import {
  hostedVoiceSession,
  openHostedVoiceRealtimeSocket,
} from "@/features/voice/security/hosted-voice-session";
import { usePcmCapture } from "@/features/voice/use-pcm-capture";
import { useVibePadHost } from "@/lib/vibepad-host-context";

const waveformPoints = 42;
const waveformIntervalMs = 50;

export type DictationPhase =
  | "connecting"
  | "failed"
  | "idle"
  | "processing"
  | "recording"
  | "requesting_permission";

export interface DictationState {
  readonly errorMessage?: string | undefined;
  readonly interimText: string;
  readonly levels: readonly number[];
  readonly phase: DictationPhase;
}

export interface UseSessionDictationOptions {
  readonly onTranscript: (
    transcript: string,
    sendAfterInsert: boolean
  ) => Promise<void> | void;
  readonly showInterimTranscript?: boolean;
}

const initialState: DictationState = {
  interimText: "",
  levels: [],
  phase: "idle",
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Voice dictation failed";

export function useSessionDictation({
  onTranscript,
  showInterimTranscript = false,
}: UseSessionDictationOptions) {
  const host = useVibePadHost();
  const { settings } = useAppSettings();
  const [state, setState] = useState<DictationState>(initialState);
  const callbackRef = useRef(onTranscript);
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const cancelledRef = useRef(false);
  const sendAfterInsertRef = useRef(false);
  const terminalRef = useRef(false);
  const lastWaveformUpdateRef = useRef(0);

  callbackRef.current = onTranscript;

  const receiveBuffer = useCallback((buffer: PcmAudioBuffer) => {
    const normalized = normalizeLinear16(buffer);
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(normalized);
    }

    const now = Date.now();
    if (now - lastWaveformUpdateRef.current < waveformIntervalMs) {
      return;
    }
    lastWaveformUpdateRef.current = now;
    const level = pcmLevel(normalized);
    setState((current) => ({
      ...current,
      levels: [...current.levels.slice(-(waveformPoints - 1)), level],
    }));
  }, []);
  const {
    prepare: prepareCapture,
    start: startCapture,
    stop: stopCapture,
  } = usePcmCapture(receiveBuffer);

  const fail = useCallback(
    async (message: string) => {
      terminalRef.current = true;
      await stopCapture().catch(() => undefined);
      const socket = socketRef.current;
      socketRef.current = undefined;
      if (
        socket &&
        (socket.readyState === WebSocket.CONNECTING ||
          socket.readyState === WebSocket.OPEN)
      ) {
        socket.close(1011, "Dictation failed");
      }
      setState((current) => ({
        ...current,
        errorMessage: message,
        phase: "failed",
      }));
    },
    [stopCapture]
  );

  const finish = useCallback(
    async (transcript: string) => {
      terminalRef.current = true;
      await stopCapture().catch(() => undefined);
      const socket = socketRef.current;
      socketRef.current = undefined;
      if (
        socket &&
        (socket.readyState === WebSocket.CONNECTING ||
          socket.readyState === WebSocket.OPEN)
      ) {
        socket.close(1000, "Dictation completed");
      }
      const text = transcript.trim();
      if (!text) {
        setState((current) => ({
          ...current,
          errorMessage: "No speech was detected",
          phase: "failed",
        }));
        return;
      }
      try {
        await callbackRef.current(text, sendAfterInsertRef.current);
        setState(initialState);
      } catch (error) {
        setState((current) => ({
          ...current,
          errorMessage: errorMessage(error),
          phase: "failed",
        }));
      }
    },
    [stopCapture]
  );

  const finishSafely = useCallback(
    async (transcript: string) => {
      try {
        await finish(transcript);
      } catch (error) {
        await fail(errorMessage(error));
      }
    },
    [fail, finish]
  );

  const handleSocketMessage = useCallback(
    (message: MessageEvent) => {
      if (typeof message.data !== "string") {
        return;
      }
      let candidate: unknown;
      try {
        candidate = JSON.parse(message.data) as unknown;
      } catch {
        return;
      }
      const parsed = realtimeVoiceEventSchema.safeParse(candidate);
      if (!parsed.success) {
        return;
      }
      const event = parsed.data;
      if (event.type === "session.completed") {
        finishSafely(event.result.content.text).catch(() => undefined);
        return;
      }
      if (event.type === "session.failed") {
        fail(event.error.message).catch(() => undefined);
        return;
      }
      if (
        showInterimTranscript &&
        (event.type === "transcript.interim" ||
          event.type === "transcript.delta" ||
          event.type === "transcript.committed")
      ) {
        setState((current) => ({ ...current, interimText: event.text }));
      }
    },
    [fail, finishSafely, showInterimTranscript]
  );

  const start = useCallback(async () => {
    if (state.phase !== "idle" && state.phase !== "failed") {
      return;
    }
    cancelledRef.current = false;
    sendAfterInsertRef.current = false;
    terminalRef.current = false;
    setState({ interimText: "", levels: [], phase: "requesting_permission" });

    try {
      await prepareCapture();
      setState((current) => ({ ...current, phase: "connecting" }));
      let socket: WebSocket;
      if (settings.voice.transport === "hosted") {
        socket = openHostedVoiceRealtimeSocket(
          await hostedVoiceSession.realtimeConnection(
            settings.voice.transcriptionModel
          )
        );
      } else {
        const connection = await host.voiceRealtimeConnection();
        socket =
          connection.protocols.length > 0
            ? new WebSocket(connection.url, [...connection.protocols])
            : new WebSocket(connection.url);
      }
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      socket.onmessage = handleSocketMessage;
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () =>
          reject(new Error("Unable to connect to Voice Lab"));
        socket.onclose = (event) =>
          reject(new Error(event.reason || "Voice Lab disconnected"));
      });
      socket.onerror = () => {
        if (!(cancelledRef.current || terminalRef.current)) {
          fail("Unable to connect to Voice Lab").catch(() => undefined);
        }
      };
      socket.onclose = (event) => {
        if (!(cancelledRef.current || terminalRef.current)) {
          fail(event.reason || "Voice Lab disconnected").catch(() => undefined);
        }
      };
      if (cancelledRef.current) {
        return;
      }
      await startCapture();
      setState((current) => ({ ...current, phase: "recording" }));
    } catch (error) {
      await fail(errorMessage(error));
    }
  }, [
    fail,
    handleSocketMessage,
    host,
    prepareCapture,
    startCapture,
    state.phase,
    settings.voice.transcriptionModel,
    settings.voice.transport,
  ]);

  const stop = useCallback(
    async (sendAfterInsert = false) => {
      if (cancelledRef.current || state.phase !== "recording") {
        return;
      }
      sendAfterInsertRef.current = sendAfterInsert;
      setState((current) => ({ ...current, phase: "processing" }));
      try {
        await stopCapture();
        const socket = socketRef.current;
        if (socket?.readyState !== WebSocket.OPEN) {
          throw new Error("Voice Lab disconnected before transcription");
        }
        socket.send(JSON.stringify({ type: "close" }));
      } catch (error) {
        await fail(errorMessage(error));
      }
    },
    [fail, state.phase, stopCapture]
  );

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    terminalRef.current = true;
    await stopCapture().catch(() => undefined);
    const socket = socketRef.current;
    socketRef.current = undefined;
    if (
      socket &&
      (socket.readyState === WebSocket.CONNECTING ||
        socket.readyState === WebSocket.OPEN)
    ) {
      socket.close(1000, "Dictation cancelled");
    }
    setState(initialState);
  }, [stopCapture]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      const socket = socketRef.current;
      if (
        socket &&
        (socket.readyState === WebSocket.CONNECTING ||
          socket.readyState === WebSocket.OPEN)
      ) {
        socket.close(1000, "Dictation view closed");
      }
    },
    []
  );

  return { cancel, start, state, stop } as const;
}
