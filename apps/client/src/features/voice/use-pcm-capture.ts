import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from "expo-audio";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";

import type { PcmAudioBuffer } from "@/features/voice/pcm";

interface WebAudioCapture {
  context: AudioContext;
  output: GainNode;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
}

const floatToInt16 = (samples: Float32Array) => {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    pcm[index] = sample < 0 ? sample * 32_768 : sample * 32_767;
  }
  return pcm;
};

const stopMediaStream = (stream: MediaStream) => {
  for (const track of stream.getTracks()) {
    track.stop();
  }
};

export function usePcmCapture(onBuffer: (buffer: PcmAudioBuffer) => void) {
  const preparedWebStreamRef = useRef<MediaStream | undefined>(undefined);
  const webCaptureRef = useRef<WebAudioCapture | undefined>(undefined);
  const { stream: nativeStream } = useAudioStream({
    channels: 1,
    encoding: "int16",
    onBuffer,
    sampleRate: 16_000,
  });

  const prepare = useCallback(async () => {
    if (Platform.OS !== "web") {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error(
          permission.canAskAgain
            ? "Microphone permission is required for dictation"
            : "Enable microphone access for VibePad in Settings"
        );
      }
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support microphone capture");
    }
    if (!preparedWebStreamRef.current) {
      preparedWebStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16_000,
        },
      });
    }
  }, []);

  const start = useCallback(async () => {
    if (Platform.OS !== "web") {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await nativeStream.start();
      return;
    }

    const mediaStream = preparedWebStreamRef.current;
    preparedWebStreamRef.current = undefined;
    if (!mediaStream) {
      throw new Error("Microphone capture was not prepared");
    }
    const context = new AudioContext({ sampleRate: 16_000 });
    const source = context.createMediaStreamSource(mediaStream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const output = context.createGain();
    output.gain.value = 0;
    processor.onaudioprocess = (event) => {
      const pcm = floatToInt16(event.inputBuffer.getChannelData(0));
      onBuffer({
        channels: 1,
        data: pcm.buffer,
        sampleRate: context.sampleRate,
        timestamp: context.currentTime,
      });
    };
    source.connect(processor);
    processor.connect(output);
    output.connect(context.destination);
    webCaptureRef.current = {
      context,
      output,
      processor,
      source,
      stream: mediaStream,
    };
  }, [nativeStream, onBuffer]);

  const stop = useCallback(async () => {
    if (Platform.OS === "web") {
      const preparedStream = preparedWebStreamRef.current;
      preparedWebStreamRef.current = undefined;
      if (preparedStream) {
        stopMediaStream(preparedStream);
      }
      const capture = webCaptureRef.current;
      webCaptureRef.current = undefined;
      if (!capture) {
        return;
      }
      capture.processor.onaudioprocess = null;
      capture.processor.disconnect();
      capture.source.disconnect();
      capture.output.disconnect();
      stopMediaStream(capture.stream);
      await capture.context.close();
      return;
    }
    if (nativeStream.isStreaming) {
      nativeStream.stop();
    }
    await setAudioModeAsync({ allowsRecording: false });
  }, [nativeStream]);

  useEffect(
    () => () => {
      const preparedStream = preparedWebStreamRef.current;
      if (preparedStream) {
        stopMediaStream(preparedStream);
      }
      const capture = webCaptureRef.current;
      if (capture) {
        capture.processor.onaudioprocess = null;
        capture.processor.disconnect();
        capture.source.disconnect();
        capture.output.disconnect();
        stopMediaStream(capture.stream);
        capture.context.close().catch(() => undefined);
      }
      if (Platform.OS !== "web" && nativeStream.isStreaming) {
        nativeStream.stop();
      }
    },
    [nativeStream]
  );

  return { prepare, start, stop } as const;
}
