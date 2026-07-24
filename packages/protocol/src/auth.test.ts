import { describe, expect, it } from "vitest";

import { decodePairingInvitationUrl, pairingInvitationUrl } from "./auth";

describe("host pairing invitations", () => {
  it("round-trips the code and endpoint candidates", () => {
    const invitation = {
      code: "ABCD-2345",
      endpoints: ["http://gmk:4100", "http://192.168.1.12:4100"],
      expiresAt: "2026-07-21T23:30:00.000Z",
      hostId: "gmk",
      hostName: "GMK",
      version: 1 as const,
    };

    expect(
      decodePairingInvitationUrl(pairingInvitationUrl(invitation))
    ).toEqual(invitation);
  });

  it("rejects unrelated and incomplete links", () => {
    expect(
      decodePairingInvitationUrl("https://vibepad.test/pair")
    ).toBeUndefined();
    expect(
      decodePairingInvitationUrl("vibepad://pair?code=ABCD-2345")
    ).toBeUndefined();
  });
});
