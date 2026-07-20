export const waveformPointCount = 42;

export function pushWaveformLevel(
  levels: number[],
  level: number,
  capacity = waveformPointCount
) {
  "worklet";
  if (levels.length >= capacity) {
    levels.splice(0, levels.length - capacity + 1);
  }
  levels.push(level);
  return levels;
}
