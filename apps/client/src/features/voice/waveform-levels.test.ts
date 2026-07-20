import { describe, expect, it } from "vitest";

import { pushWaveformLevel } from "./waveform-levels";

describe("dictation waveform levels", () => {
  it("updates a bounded signal in place", () => {
    const levels = [0.1, 0.2, 0.3];

    expect(pushWaveformLevel(levels, 0.4, 3)).toBe(levels);
    expect(levels).toEqual([0.2, 0.3, 0.4]);
  });
});
