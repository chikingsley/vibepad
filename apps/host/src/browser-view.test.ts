import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it as test } from "vitest";

import { findChromiumExecutable } from "./chromium-browser";

const execFileAsync = promisify(execFile);
const fixturePath = fileURLToPath(
  new URL("./browser-view.fixture.ts", import.meta.url)
);

const executable = await findChromiumExecutable();

// CI must exercise a real browser. Only local machines may skip these suites.
// biome-ignore lint/complexity/useLiteralKeys: strict index-signature access is required by the shared TypeScript config.
const skipLiveBrowser = !(executable || process.env["CI"]);

describe.skipIf(skipLiveBrowser)("brokering a real Chromium view", () => {
  test("leases, streams frames, forwards input, and reflows over the live host", async () => {
    const { stdout } = await execFileAsync("bun", [fixturePath], {
      timeout: 110_000,
    });
    const result = JSON.parse(stdout) as {
      clickPoint: { x: number; y: number };
      firstFrameBytes: number;
      firstFrameMetadata: { deviceHeight: number; deviceWidth: number };
      frameCount: number;
      leasePath: string;
      recordedClicks: [number, number][];
      reflowWidth: number;
      resizedFrameWidth: number;
      resizedWidth: number;
      state: {
        activeTargetId?: string;
        available: boolean;
        healthy: boolean;
        targetUrls: string[];
      };
      targetId: string;
      typedValue: string;
      viewerHasCanvas: boolean;
      viewerHasSocketPath: boolean;
    };

    // The client-facing contract stayed stable: state, target, and lease.
    expect(result.state.available).toBe(true);
    expect(result.state.healthy).toBe(true);
    expect(result.state.activeTargetId).toBe(result.targetId);
    expect(
      result.state.targetUrls.some((url) => url.startsWith("http://127.0.0.1:"))
    ).toBe(true);
    expect(result.leasePath.startsWith("/v1/browser/view/")).toBe(true);

    // The host serves the self-contained viewer at the leased path.
    expect(result.viewerHasCanvas).toBe(true);
    expect(result.viewerHasSocketPath).toBe(true);

    // Real screencast frames arrived over the authenticated WebSocket.
    expect(result.frameCount).toBeGreaterThan(0);
    expect(result.firstFrameBytes).toBeGreaterThan(1000);
    expect(result.firstFrameMetadata.deviceWidth).toBe(640);

    // The viewport override produced a true page reflow, twice.
    expect(result.reflowWidth).toBe(640);
    expect(result.resizedWidth).toBe(500);
    expect(result.resizedFrameWidth).toBe(500);

    // The forwarded synthetic click landed where it was sent.
    expect(result.recordedClicks.length).toBeGreaterThan(0);
    expect(result.recordedClicks[0]?.[0]).toBe(result.clickPoint.x);
    expect(result.recordedClicks[0]?.[1]).toBe(result.clickPoint.y);

    // The forwarded key event reached the focused element.
    expect(result.typedValue).toContain("v");
  }, 120_000);
});
