import { Database } from "bun:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  hostAuthWebSocketProtocolPrefix,
  type PairedHost,
  type PairHostRequest,
} from "@vibepad/protocol/auth";

import { HostAuthError, type HostAuthPrincipal } from "./host-auth-contract";

const pairingAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const pairingCodeCharacters = 8;
const pairingCodeMaxFailedAttempts = 5;
const pairingCodeTtlMs = 10 * 60 * 1000;
const databaseBusyTimeoutMs = 5000;
const lastSeenWriteIntervalMs = 60 * 1000;
const bearerPrefix = "vp_";

interface PairingCodeRow {
  readonly consumed_at: string | null;
  readonly expires_at: string;
}

interface PairingAttemptRow {
  readonly failed_attempts: number;
  readonly window_started_at: string;
}

interface PairedDeviceRow {
  readonly app_id: string | null;
  readonly app_version: string | null;
  readonly client_version: string | null;
  readonly device_id: string;
  readonly device_model: string | null;
  readonly device_name: string;
  readonly installation_id: string | null;
  readonly last_seen_at: string;
  readonly os_version: string | null;
  readonly platform: string | null;
}

export interface PairingCode {
  readonly code: string;
  readonly expiresAt: string;
}

export interface HostAuthServiceOptions {
  readonly databasePath: string;
  readonly hostId: string;
  readonly hostName: string;
}

const digest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const normalizePairingCode = (code: string) =>
  code.replaceAll("-", "").toLocaleUpperCase();

const displayPairingCode = (code: string) =>
  code.match(/.{1,4}/gu)?.join("-") ?? code;

const createPairingCode = () => {
  const bytes = randomBytes(pairingCodeCharacters);
  let code = "";
  for (const byte of bytes) {
    code += pairingAlphabet[byte % pairingAlphabet.length];
  }
  return code;
};

const bearerToken = () =>
  `${bearerPrefix}${randomBytes(32).toString("base64url")}`;

const bearerFromAuthorization = (authorization: string | null) => {
  if (!authorization?.startsWith("Bearer ")) {
    return;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token.startsWith(bearerPrefix) ? token : undefined;
};

export const bearerFromWebSocketProtocol = (header: string | null) => {
  const protocol = header
    ?.split(",")
    .map((value) => value.trim())
    .find((value) => value.startsWith(hostAuthWebSocketProtocolPrefix));
  if (!protocol) {
    return;
  }
  const token = protocol.slice(hostAuthWebSocketProtocolPrefix.length);
  return token.startsWith(bearerPrefix) ? { protocol, token } : undefined;
};

export class HostAuthService {
  readonly #database: Database;
  readonly #hostId: string;
  readonly #hostName: string;

  constructor(options: HostAuthServiceOptions) {
    mkdirSync(dirname(options.databasePath), { recursive: true });
    this.#database = new Database(options.databasePath, {
      create: true,
      strict: true,
    });
    this.#hostId = options.hostId;
    this.#hostName = options.hostName;
    this.#database.exec(`PRAGMA busy_timeout = ${databaseBusyTimeoutMs}`);
    this.#database.exec("PRAGMA foreign_keys = ON");
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS pairing_codes (
        code_hash TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
      )
    `);
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS paired_devices (
        device_id TEXT PRIMARY KEY,
        device_name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        revoked_at TEXT
      )
    `);
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS paired_device_metadata (
        device_id TEXT PRIMARY KEY,
        installation_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        app_version TEXT NOT NULL,
        client_version TEXT NOT NULL,
        device_model TEXT NOT NULL,
        platform TEXT NOT NULL,
        os_version TEXT NOT NULL,
        FOREIGN KEY(device_id) REFERENCES paired_devices(device_id)
          ON DELETE CASCADE
      )
    `);
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS pairing_attempts (
        source_hash TEXT PRIMARY KEY,
        window_started_at TEXT NOT NULL,
        failed_attempts INTEGER NOT NULL
      )
    `);
  }

  authenticateAuthorization(
    authorization: string | null
  ): HostAuthPrincipal | undefined {
    const token = bearerFromAuthorization(authorization);
    return token ? this.authenticateToken(token) : undefined;
  }

  authenticateToken(token: string): HostAuthPrincipal | undefined {
    const row = this.#database
      .query<PairedDeviceRow, [string]>(`
        SELECT
          paired_devices.device_id,
          paired_devices.device_name,
          paired_device_metadata.app_id,
          paired_device_metadata.app_version,
          paired_device_metadata.client_version,
          paired_device_metadata.device_model,
          paired_device_metadata.installation_id,
          paired_devices.last_seen_at,
          paired_device_metadata.os_version,
          paired_device_metadata.platform
        FROM paired_devices
        LEFT JOIN paired_device_metadata
          ON paired_device_metadata.device_id = paired_devices.device_id
        WHERE paired_devices.token_hash = ?
          AND paired_devices.revoked_at IS NULL
      `)
      .get(digest(token));
    if (!row) {
      return;
    }
    const now = new Date();
    if (
      Date.parse(row.last_seen_at) <=
      now.getTime() - lastSeenWriteIntervalMs
    ) {
      this.#database
        .query<unknown, [string, string]>(`
          UPDATE paired_devices
          SET last_seen_at = ?
          WHERE device_id = ?
        `)
        .run(now.toISOString(), row.device_id);
    }
    return {
      clientMetadata: {
        appId: row.app_id ?? "studio.peacockery.vibepad",
        appVersion: row.app_version ?? "unknown",
        clientVersion: row.client_version ?? "unknown",
        deviceModel: row.device_model ?? row.device_name,
        installationId: row.installation_id ?? row.device_id,
        osVersion: row.os_version ?? "unknown",
        platform: row.platform ?? "unknown",
      },
      deviceId: row.device_id,
      deviceName: row.device_name,
    };
  }

  close(): void {
    this.#database.close(true);
  }

  createPairingCode(now = new Date()): PairingCode {
    const normalized = createPairingCode();
    const expiresAt = new Date(now.getTime() + pairingCodeTtlMs).toISOString();
    const attemptCutoff = new Date(
      now.getTime() - pairingCodeTtlMs
    ).toISOString();
    this.#database
      .query<unknown, [string]>(`
        DELETE FROM pairing_attempts
        WHERE window_started_at <= ?
      `)
      .run(attemptCutoff);
    this.#database
      .query<unknown, [string]>(`
        DELETE FROM pairing_codes
        WHERE consumed_at IS NOT NULL OR expires_at <= ?
      `)
      .run(now.toISOString());
    this.#database
      .query<unknown, [string, string, string]>(`
        INSERT INTO pairing_codes (code_hash, created_at, expires_at)
        VALUES (?, ?, ?)
      `)
      .run(digest(normalized), now.toISOString(), expiresAt);
    return { code: displayPairingCode(normalized), expiresAt };
  }

  redeem(
    input: PairHostRequest,
    sourceAddress = "unknown",
    now = new Date()
  ): PairedHost {
    const sourceHash = digest(sourceAddress);
    this.#assertPairingAttemptAllowed(sourceHash, now);
    const codeHash = digest(normalizePairingCode(input.code));
    try {
      const row = this.#database
        .query<PairingCodeRow, [string]>(`
          SELECT consumed_at, expires_at
          FROM pairing_codes
          WHERE code_hash = ?
        `)
        .get(codeHash);
      if (
        !row ||
        row.consumed_at ||
        Date.parse(row.expires_at) <= now.getTime()
      ) {
        throw new HostAuthError(
          "pairing_code_invalid",
          "The pairing code is invalid, expired, or already used",
          401
        );
      }

      const token = bearerToken();
      const deviceId = randomUUID();
      const timestamp = now.toISOString();
      const redeem = this.#database.transaction(() => {
        const consumed = this.#database
          .query<unknown, [string, string, string]>(`
            UPDATE pairing_codes
            SET consumed_at = ?
            WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ?
          `)
          .run(timestamp, codeHash, timestamp);
        if (consumed.changes !== 1) {
          throw new HostAuthError(
            "pairing_code_invalid",
            "The pairing code is invalid, expired, or already used",
            401
          );
        }
        this.#database
          .query<unknown, [string, string, string, string, string]>(`
            INSERT INTO paired_devices (
              device_id,
              device_name,
              token_hash,
              created_at,
              last_seen_at
            ) VALUES (?, ?, ?, ?, ?)
          `)
          .run(deviceId, input.deviceName, digest(token), timestamp, timestamp);
        this.#database
          .query<
            unknown,
            [string, string, string, string, string, string, string, string]
          >(`
            INSERT INTO paired_device_metadata (
              device_id,
              installation_id,
              app_id,
              app_version,
              client_version,
              device_model,
              platform,
              os_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            deviceId,
            input.clientMetadata.installationId,
            input.clientMetadata.appId,
            input.clientMetadata.appVersion,
            input.clientMetadata.clientVersion,
            input.clientMetadata.deviceModel,
            input.clientMetadata.platform,
            input.clientMetadata.osVersion
          );
      });
      redeem();
      this.#database
        .query<unknown, [string]>(`
          DELETE FROM pairing_attempts
          WHERE source_hash = ?
        `)
        .run(sourceHash);

      return {
        deviceId,
        hostId: this.#hostId,
        hostName: this.#hostName,
        token,
      };
    } catch (error) {
      if (
        error instanceof HostAuthError &&
        error.code === "pairing_code_invalid"
      ) {
        this.#recordFailedPairingAttempt(sourceHash, now);
      }
      throw error;
    }
  }

  revokeAuthorization(authorization: string | null): boolean {
    const token = bearerFromAuthorization(authorization);
    if (!token) {
      return false;
    }
    const revoked = this.#database
      .query<unknown, [string, string]>(`
        UPDATE paired_devices
        SET revoked_at = ?
        WHERE token_hash = ? AND revoked_at IS NULL
      `)
      .run(new Date().toISOString(), digest(token));
    return revoked.changes === 1;
  }

  #assertPairingAttemptAllowed(sourceHash: string, now: Date): void {
    const row = this.#database
      .query<PairingAttemptRow, [string]>(`
        SELECT failed_attempts, window_started_at
        FROM pairing_attempts
        WHERE source_hash = ?
      `)
      .get(sourceHash);
    if (!row) {
      return;
    }
    const resetAt = Date.parse(row.window_started_at) + pairingCodeTtlMs;
    if (resetAt <= now.getTime()) {
      this.#database
        .query<unknown, [string]>(`
          DELETE FROM pairing_attempts
          WHERE source_hash = ?
        `)
        .run(sourceHash);
      return;
    }
    if (row.failed_attempts >= pairingCodeMaxFailedAttempts) {
      throw new HostAuthError(
        "pairing_rate_limited",
        "Too many pairing attempts; wait for the current code window to end",
        429,
        Math.ceil((resetAt - now.getTime()) / 1000)
      );
    }
  }

  #recordFailedPairingAttempt(sourceHash: string, now: Date): void {
    this.#database
      .query<unknown, [string, string]>(`
        INSERT INTO pairing_attempts (
          source_hash,
          window_started_at,
          failed_attempts
        ) VALUES (?, ?, 1)
        ON CONFLICT(source_hash) DO UPDATE SET
          failed_attempts = pairing_attempts.failed_attempts + 1
      `)
      .run(sourceHash, now.toISOString());
  }
}
