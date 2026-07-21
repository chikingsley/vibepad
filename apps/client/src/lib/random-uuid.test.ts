import { describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ getRandomBytes: vi.fn() }));

import { uuidFromRandomBytes } from "./random-uuid";

describe("uuidFromRandomBytes", () => {
  it("formats random bytes as an RFC 4122 version 4 UUID", () => {
    const uuid = uuidFromRandomBytes(
      Uint8Array.from({ length: 16 }, (_, index) => index)
    );

    expect(uuid).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("rejects the wrong random byte count", () => {
    expect(() => uuidFromRandomBytes(new Uint8Array(15))).toThrow(
      "UUID input must contain 16 bytes"
    );
  });
});
