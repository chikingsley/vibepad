import { createHostProfile } from "@vibepad/protocol/settings";
import { describe, expect, it, vi } from "vitest";

import { checkSavedComputers } from "./computer-connection-checks";

const savedHost = (id: string) =>
  createHostProfile({ id, name: id, url: `http://${id}:4100` });

describe("saved computer checks", () => {
  it("marks a healthy computer connecting then connected", async () => {
    const report = vi.fn();
    await checkSavedComputers([savedHost("studio")], undefined, {
      fetch: vi.fn(async () => new Response(null, { status: 200 })),
      report,
      wait: vi.fn(async () => undefined),
    });

    expect(report.mock.calls).toEqual([
      ["studio", "connecting"],
      ["studio", "connected"],
    ]);
  });

  it("marks an unreachable computer offline", async () => {
    const report = vi.fn();
    await checkSavedComputers([savedHost("studio")], undefined, {
      fetch: vi.fn(() => Promise.reject(new Error("refused"))),
      report,
      wait: vi.fn(async () => undefined),
    });

    expect(report).toHaveBeenLastCalledWith(
      "studio",
      "offline",
      "This computer is unreachable."
    );
  });

  it("marks an unhealthy response as attention", async () => {
    const report = vi.fn();
    await checkSavedComputers([savedHost("studio")], undefined, {
      fetch: vi.fn(async () => new Response(null, { status: 503 })),
      report,
      wait: vi.fn(async () => undefined),
    });

    expect(report).toHaveBeenLastCalledWith(
      "studio",
      "attention",
      "VibePad Host responded 503."
    );
  });

  it("marks a computer offline when the health check times out", async () => {
    const report = vi.fn();
    await checkSavedComputers([savedHost("studio")], undefined, {
      fetch: vi.fn(() => new Promise<Response>(() => undefined)),
      report,
      wait: vi.fn(async () => undefined),
    });

    expect(report).toHaveBeenLastCalledWith(
      "studio",
      "offline",
      "This computer is unreachable."
    );
  });

  it("skips the active computer and staggers the remaining checks", async () => {
    const report = vi.fn();
    const wait = vi.fn(async () => undefined);
    await checkSavedComputers(
      [savedHost("active"), savedHost("laptop"), savedHost("studio")],
      "active",
      {
        fetch: vi.fn(async () => new Response(null, { status: 200 })),
        report,
        wait,
      }
    );

    const reportedHosts = report.mock.calls.map(([hostId]) => hostId);
    expect(reportedHosts).not.toContain("active");
    expect(reportedHosts).toEqual(["laptop", "laptop", "studio", "studio"]);
    expect(wait).toHaveBeenCalledWith(300);
  });
});
