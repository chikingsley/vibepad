import { realtimeVoiceEventSchema } from "@vibepad/protocol/voice";
import { useCallback, useEffect, useRef } from "react";
import { useSharedValue } from "react-native-reanimated";
import { useSettingsValue } from "@/features/settings/settings-context";
import {
  normalizeLinear16,
  type PcmAudioBuffer,
  pcmLevel,
} from "@/features/voice/pcm";
import {
  hostedVoiceSession,
  openHostedVoiceRealtimeSocket,
} from "@/features/voice/security/hosted-voice-session";
import { createDictationRuntimeStore } from "@/features/voice/state/dictation-runtime-store";
import { usePcmCapture } from "@/features/voice/use-pcm-capture";
import { pushWaveformLevel } from "@/features/voice/waveform-levels";
import { useVibePadHost } from "@/lib/vibepad-host-context";

const waveformIntervalMs = 50;

export interface UseSessionDictationOptions {
  readonly onTranscript: (
    transcript: string,
    sendAfterInsert: boolean
  ) => Promise<void> | void;
  readonly showInterimTranscript?: boolean;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Voice dictation failed";

export function useSessionDictation({
  onTranscript,
  showInterimTranscript = false,
}: UseSessionDictationOptions) {
  const host = useVibePadHost();
  const transcriptionModel = useSettingsValue((state$) =>
    state$.settings.voice.transcriptionModel.get()
  );
  const voiceTransport = useSettingsValue((state$) =>
    state$.settings.voice.transport.get()
  );
  const storeRef = useRef<
    ReturnType<typeof createDictationRuntimeStore> | undefined
  >(undefined);
  storeRef.current ??= createDictationRuntimeStore();
  const store = storeRef.current;
  const waveformLevels = useSharedValue<number[]>([]);
  const callbackRef = useRef(onTranscript);
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const cancelledRef = useRef(false);
  const sendAfterInsertRef = useRef(false);
  const terminalRef = useRef(false);
  const lastWaveformUpdateRef = useRef(0);

  callbackRef.current = onTranscript;

  const receiveBuffer = useCallback(
    (buffer: PcmAudioBuffer) => {
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
      waveformLevels.modify((levels) => {
        "worklet";
        return pushWaveformLevel(levels, level);
      }, true);
    },
    [waveformLevels]
  );
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
      store.fail(message);
    },
    [stopCapture, store]
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
        store.fail("No speech was detected");
        return;
      }
      try {
        await callbackRef.current(text, sendAfterInsertRef.current);
        store.reset();
        waveformLevels.set([]);
      } catch (error) {
        store.fail(errorMessage(error));
      }
    },
    [stopCapture, store, waveformLevels]
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
        store.setInterimText(event.text);
      }
    },
    [fail, finishSafely, showInterimTranscript, store]
  );

  const start = useCallback(async () => {
    if (!store.begin()) {
      return;
    }
    cancelledRef.current = false;
    sendAfterInsertRef.current = false;
    terminalRef.current = false;
    lastWaveformUpdateRef.current = 0;
    waveformLevels.set([]);

    try {
      await prepareCapture();
      store.setPhase("connecting");
      let socket: WebSocket;
      if (voiceTransport === "hosted") {
        socket = openHostedVoiceRealtimeSocket(
          await hostedVoiceSession.realtimeConnection(transcriptionModel)
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
        // biome-ignore lint/suspicious/noUnnecessaryConditions: The ref changes between renders and across awaits, which flow typing cannot see.
        if (!(cancelledRef.current || terminalRef.current)) {
          fail("Unable to connect to Voice Lab").catch(() => undefined);
        }
      };
      socket.onclose = (event) => {
        // biome-ignore lint/suspicious/noUnnecessaryConditions: The ref changes between renders and across awaits, which flow typing cannot see.
        if (!(cancelledRef.current || terminalRef.current)) {
          fail(event.reason || "Voice Lab disconnected").catch(() => undefined);
        }
      };
      // biome-ignore lint/suspicious/noUnnecessaryConditions: The ref changes between renders and across awaits, which flow typing cannot see.
      if (cancelledRef.current) {
        return;
      }
      await startCapture();
      store.setPhase("recording");
    } catch (error) {
      await fail(errorMessage(error));
    }
  }, [
    fail,
    handleSocketMessage,
    host,
    prepareCapture,
    startCapture,
    store,
    transcriptionModel,
    voiceTransport,
    waveformLevels,
  ]);

  const stop = useCallback(
    async (sendAfterInsert = false) => {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: The ref changes between renders and across awaits, which flow typing cannot see.
      if (cancelledRef.current || !store.beginProcessing()) {
        return;
      }
      sendAfterInsertRef.current = sendAfterInsert;
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
    [fail, stopCapture, store]
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
    store.reset();
    waveformLevels.set([]);
  }, [stopCapture, store, waveformLevels]);

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

  return {
    cancel,
    start,
    state$: store.state$,
    stop,
    waveformLevels,
  } as const;
}
