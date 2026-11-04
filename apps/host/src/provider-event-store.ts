import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type ProviderEvent,
  type ProviderEventStore,
  providerEventSchema,
} from "@vibepad/protocol/events";

interface EventRow {
  readonly cursor: string | null;
  readonly event_id: string;
  readonly kind: string;
  readonly native_json: string;
  readonly project_id: string;
  readonly provider_id: string;
  readonly sequence: number;
  readonly session_id: string;
  readonly timestamp: string;
}

interface SequenceRow {
  readonly sequence: number;
}

const projectEvent = (row: EventRow): ProviderEvent =>
  providerEventSchema.parse({
    ...(row.cursor ? { cursor: row.cursor } : {}),
    eventId: row.event_id,
    kind: row.kind,
    native: JSON.parse(row.native_json) as unknown,
    projectId: row.project_id,
    providerId: row.provider_id,
    sequence: row.sequence,
    sessionId: row.session_id,
    timestamp: row.timestamp,
  });

export class SqliteProviderEventStore implements ProviderEventStore {
  readonly #database: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.#database = new Database(path, { create: true, strict: true });
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS provider_events (
        provider_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        cursor TEXT,
        event_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        native_json TEXT NOT NULL,
        PRIMARY KEY (provider_id, sequence),
        UNIQUE (event_id)
      )
    `);
    this.#database.exec(`
      CREATE INDEX IF NOT EXISTS provider_events_session_sequence
      ON provider_events (provider_id, session_id, sequence)
    `);
  }

  append(event: ProviderEvent): void {
    this.#database
      .query<
        unknown,
        [
          string,
          number,
          string | null,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      >(`
        INSERT INTO provider_events (
          provider_id,
          sequence,
          cursor,
          event_id,
          session_id,
          project_id,
          kind,
          timestamp,
          native_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        event.providerId,
        event.sequence,
        event.cursor ?? null,
        event.eventId,
        event.sessionId,
        event.projectId,
        event.kind,
        event.timestamp,
        // biome-ignore lint/suspicious/noUnnecessaryConditions: JSON.stringify returns undefined for undefined and functions, despite its declared type.
        JSON.stringify(event.native) ?? "null"
      );
  }

  close(): void {
    this.#database.close(true);
  }

  latestSequence(providerId: string): number {
    return (
      this.#database
        .query<SequenceRow, [string]>(`
          SELECT COALESCE(MAX(sequence), 0) AS sequence
          FROM provider_events
          WHERE provider_id = ?
        `)
        .get(providerId)?.sequence ?? 0
    );
  }

  list(
    providerId: string,
    sessionId: string,
    afterSequence = 0
  ): readonly ProviderEvent[] {
    return this.#database
      .query<EventRow, [string, string, number]>(`
        SELECT
          provider_id,
          sequence,
          cursor,
          event_id,
          session_id,
          project_id,
          kind,
          timestamp,
          native_json
        FROM provider_events
        WHERE provider_id = ? AND session_id = ? AND sequence > ?
        ORDER BY sequence ASC
      `)
      .all(providerId, sessionId, afterSequence)
      .map(projectEvent);
  }
}
