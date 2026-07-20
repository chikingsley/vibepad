import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type ReadySessionControls,
  readySessionControlsSchema,
  type SessionControlStore,
} from "@vibepad/protocol/provider";

interface SessionControlRow {
  readonly controls_json: string;
}

export class SqliteProviderSessionStore implements SessionControlStore {
  readonly #database: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.#database = new Database(path, { create: true, strict: true });
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS provider_session_controls (
        provider_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        controls_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (provider_id, session_id)
      )
    `);
  }

  close(): void {
    this.#database.close(true);
  }

  delete(providerId: string, sessionId: string): void {
    this.#database
      .query<unknown, [string, string]>(`
        DELETE FROM provider_session_controls
        WHERE provider_id = ? AND session_id = ?
      `)
      .run(providerId, sessionId);
  }

  read(
    providerId: string,
    sessionId: string
  ): ReadySessionControls | undefined {
    const row = this.#database
      .query<SessionControlRow, [string, string]>(`
        SELECT controls_json
        FROM provider_session_controls
        WHERE provider_id = ? AND session_id = ?
      `)
      .get(providerId, sessionId);
    return row
      ? readySessionControlsSchema.parse(
          JSON.parse(row.controls_json) as unknown
        )
      : undefined;
  }

  write(
    providerId: string,
    sessionId: string,
    controls: ReadySessionControls
  ): void {
    const validated = readySessionControlsSchema.parse(controls);
    this.#database
      .query<unknown, [string, string, string, string]>(`
        INSERT INTO provider_session_controls (
          provider_id,
          session_id,
          controls_json,
          updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT (provider_id, session_id) DO UPDATE SET
          controls_json = excluded.controls_json,
          updated_at = excluded.updated_at
      `)
      .run(
        providerId,
        sessionId,
        JSON.stringify(validated),
        new Date().toISOString()
      );
  }
}
