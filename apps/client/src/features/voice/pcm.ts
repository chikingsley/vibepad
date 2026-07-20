export interface PcmAudioBuffer {
  readonly channels: number;
  readonly data: ArrayBuffer;
  readonly sampleRate: number;
  readonly timestamp: number;
}

export const pcmLevel = (data: ArrayBuffer) => {
  const samples = new Int16Array(data);
  if (samples.length === 0) {
    return 0.06;
  }
  let squareSum = 0;
  for (const sample of samples) {
    const normalized = sample / 32_768;
    squareSum += normalized * normalized;
  }
  const rms = Math.sqrt(squareSum / samples.length);
  return Math.max(0.06, Math.min(1, rms * 5.5));
};

export const normalizeLinear16 = (buffer: PcmAudioBuffer) => {
  const input = new Int16Array(buffer.data);
  const channels = Math.max(1, buffer.channels);
  const frameCount = Math.floor(input.length / channels);
  const mono = new Int16Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += input[frame * channels + channel] ?? 0;
    }
    mono[frame] = Math.round(sum / channels);
  }
  if (mono.length === 0 || buffer.sampleRate === 16_000) {
    return mono.buffer;
  }

  const outputLength = Math.max(
    1,
    Math.round((mono.length * 16_000) / buffer.sampleRate)
  );
  const output = new Int16Array(outputLength);
  const sourceStep = buffer.sampleRate / 16_000;
  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * sourceStep;
    const leftIndex = Math.min(mono.length - 1, Math.floor(sourcePosition));
    const rightIndex = Math.min(mono.length - 1, leftIndex + 1);
    const fraction = sourcePosition - leftIndex;
    const left = mono[leftIndex] ?? 0;
    const right = mono[rightIndex] ?? left;
    output[index] = Math.round(left + (right - left) * fraction);
  }
  return output.buffer;
};
