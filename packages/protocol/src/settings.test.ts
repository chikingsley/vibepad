import { describe, expect, it } from "vitest";

import {
  appSettingsSchemaVersion,
  createDefaultAppSettings,
  decodeAppSettings,
  decodeMessageScrollCheckpoint,
  messageScrollCheckpointSchemaVersion,
} from "./settings";

describe("versioned app settings", () => {
  it("round-trips supported preferences and rejects unknown schema versions", () => {
    const stored = {
      ...createDefaultAppSettings(),
      timeline: { opening: "bottom" },
      voice: {
        ...createDefaultAppSettings().voice,
        showInterimTranscript: true,
      },
    } as const;

    expect(decodeAppSettings(stored)).toEqual(stored);
    expect(
      decodeAppSettings({
        ...stored,
        schemaVersion: appSettingsSchemaVersion + 1,
      })
    ).toEqual(createDefaultAppSettings());
  });

  it("migrates version one preferences without inventing a paired host", () => {
    const current = createDefaultAppSettings();
    const { transport: _transport, ...legacyVoice } = current.voice;
    const legacy = {
      schemaVersion: 1,
      timeline: { opening: "last-position" },
      voice: legacyVoice,
    } as const;

    expect(decodeAppSettings(legacy)).toEqual({
      ...current,
      timeline: { opening: "last-position" },
    });
  });

  it("migrates version two preferences to the host voice transport", () => {
    const current = createDefaultAppSettings();
    const { transport: _transport, ...versionTwoVoice } = current.voice;
    const versionTwo = {
      connections: current.connections,
      schemaVersion: 2,
      timeline: current.timeline,
      voice: versionTwoVoice,
    } as const;

    expect(decodeAppSettings(versionTwo)).toEqual(current);
  });

  it("migrates version three hosts with automatic startup disabled", () => {
    const current = createDefaultAppSettings();
    const versionThree = {
      ...current,
      connections: {
        activeHostId: "hojo",
        hosts: [{ id: "hojo", name: "hojo", url: "http://hojo:4100" }],
      },
      schemaVersion: 3,
    } as const;

    expect(decodeAppSettings(versionThree)).toEqual({
      ...versionThree,
      connections: {
        ...versionThree.connections,
        hosts: [
          {
            ...versionThree.connections.hosts[0],
            automaticStart: {
              enabled: false,
              recoveryKeyId: null,
              ssh: null,
            },
          },
        ],
      },
      schemaVersion: appSettingsSchemaVersion,
    });
  });

  it("migrates version four recovery keys to a safe disabled state", () => {
    const current = createDefaultAppSettings();
    const versionFour = {
      ...current,
      connections: {
        activeHostId: "hojo",
        hosts: [
          {
            automaticStart: {
              enabled: true,
              recoveryKeyId: "key-from-v4",
            },
            id: "hojo",
            name: "hojo",
            url: "http://hojo:4100",
          },
        ],
      },
      schemaVersion: 4,
    } as const;

    expect(decodeAppSettings(versionFour)).toEqual({
      ...versionFour,
      connections: {
        ...versionFour.connections,
        hosts: [
          {
            ...versionFour.connections.hosts[0],
            automaticStart: {
              enabled: false,
              recoveryKeyId: "key-from-v4",
              ssh: null,
            },
          },
        ],
      },
      schemaVersion: appSettingsSchemaVersion,
    });
  });

  it("accepts only stable, non-negative message checkpoints", () => {
    const checkpoint = {
      anchorId: "message-final",
      offset: 42,
      savedAt: 1_784_000_000_000,
      schemaVersion: messageScrollCheckpointSchemaVersion,
    } as const;

    expect(decodeMessageScrollCheckpoint(checkpoint)).toEqual(checkpoint);
    expect(
      decodeMessageScrollCheckpoint({ ...checkpoint, offset: -1 })
    ).toBeUndefined();
  });
});
