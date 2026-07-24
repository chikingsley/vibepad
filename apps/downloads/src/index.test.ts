import { describe, expect, it } from "vitest";

import { downloadKey, requestedContentRange } from "./index";

describe("VibePad download routing", () => {
  it("maps public Host release paths to R2 keys", () => {
    expect(
      downloadKey("/downloads/host/v0.1.0/vibepad-host-v0.1.0-linux-x64.tar.gz")
    ).toBe("host/v0.1.0/vibepad-host-v0.1.0-linux-x64.tar.gz");
  });

  it("keeps every exposed object inside the Host prefix", () => {
    expect(downloadKey("/downloads/private/file")).toBeUndefined();
    expect(downloadKey("/downloads/host/%2e%2e/private")).toBeUndefined();
    expect(downloadKey("/downloads/host//file")).toBeUndefined();
  });

  it("describes partial downloads with the full object size", () => {
    expect(requestedContentRange("bytes=0-1023", 36_201_298)).toBe(
      "bytes 0-1023/36201298"
    );
    expect(requestedContentRange("bytes=-512", 4096)).toBe(
      "bytes 3584-4095/4096"
    );
  });
});
