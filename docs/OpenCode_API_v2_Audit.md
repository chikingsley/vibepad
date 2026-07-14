# OpenCode API v2 Audit (July 2026)

> **Implementation status (2026-07-14):** the migration described in §5 is
> implemented. VibePad now uses `/api/*` for the session runtime — health,
> messages (`/api/session/{id}/message`), prompt (`/api/session/{id}/model`
> + `/agent` + `/prompt`), interrupt, permissions v2, questions v2, agents,
> commands, and the file system (`/api/fs/*`) — and consumes v2 events from
> `/api/event` (`session.next.*` streaming, `permission.v2.*`,
> `question.v2.*`, session lifecycle). Legacy routes remain only where v2
> has no equivalent: project list/current, session list/get/create/rename/
> archive/delete/fork/revert, `/session/status` (poll reconcile),
> `/session/{id}/diff`, `/session/{id}/todo`, `/config/providers` (context
> limits), MCP, and `/experimental/tool*`. Re-audit on upstream releases;
> when v2 grows session mutation, project, and MCP groups, those can move
> too. Requires server ≥ 1.17.15.

Audit of VibePad's server integration against the OpenCode v2 API, based on:

- OpenCode `dev` branch OpenAPI spec (`packages/sdk/openapi.json`, repo `anomalyco/opencode`)
- The published `@opencode-ai/sdk` 1.17.20 (which now ships a `/v2` subpath export)
- The live `/doc` spec of the locally installed OpenCode 1.17.15
- VibePad's current API usage in `OpenCodeClient/OpenCodeClient/Services/APIClient.swift` and `SSEClient.swift`

## 1. What "v2" actually is

OpenCode rebuilt the server on Effect with a typed protocol package (`@opencode-ai/protocol`). The new
surface is mounted under **`/api/*`** (plus the `/sync/*` state-sync endpoints) and coexists with the
legacy routes. It is shipped to clients as **`@opencode-ai/sdk/v2`** (subpath export of the same npm
package, since ~1.17.x).

Status signals:

- The `/api` group annotates itself: *"Experimental HttpApi surface for selected instance routes"*, version `0.0.1`.
- `@opencode-ai/sdk-next` (in-process Effect host) says it *"will replace the existing generated
  `@opencode-ai/sdk` after its consumers migrate"*.
- OpenCode's own desktop app already consumes the v2 event vocabulary (`session.next.*`) through a
  global-sync layer.
- Upstream has generation-equivalence and schema-drift tests on the v2 contract, so shapes should be
  more stable than the legacy JSON, but "experimental" is explicit — expect additive change and
  occasional breakage until they bless it.

So: **v2 is real, published, and already present in our installed server (1.17.15 serves the identical
55-path `/api|/sync` surface as `dev`), but it deliberately covers only the session runtime — it is not
yet a full replacement.** That matches the "they didn't open it up fully" impression.

## 2. Compatibility of VibePad's current surface

Good news: **every endpoint VibePad calls today still exists on the latest server.** Exactly one is
formally deprecated:

| Status | Endpoint | VibePad call site | Replacement |
|---|---|---|---|
| **DEPRECATED** | `POST /session/{id}/permissions/{permissionID}` | `APIClient.swift:392` (`respondPermission`) | Legacy: `POST /permission/{requestID}/reply` with `{reply: "once"\|"always"\|"reject", message?}`. v2: `POST /api/session/{sessionID}/permission/{requestID}/reply` (same body shape). |

Everything else (`/session`, `/session/{id}/prompt_async`, `/global/event`, `/global/health`,
`/question/*`, `/config/providers`, `/agent`, `/command`, `/mcp`, `/file*`, `/find/file`,
`/session/{id}/fork|revert|diff|todo`, `/session/status`, `/experimental/tool*`, `/project*`) is intact
and non-deprecated.

## 3. Old → new mapping

### Covered by v2 today (migratable)

| Legacy (used by VibePad) | v2 equivalent | Notes |
|---|---|---|
| `GET /global/health` | `GET /api/health` | |
| `GET /global/event` (SSE) | `GET /api/event` (SSE, `V2Event`) | Global stream. |
| — (no equivalent today) | `GET /api/session/{id}/event?after=<seq>` (SSE) | **Durable per-session stream with replay cursor.** Reconnect after backgrounding and replay missed events instead of full-reload. The headline win for an iPad client. |
| `GET /session/{id}/message?limit=` | `GET /api/session/{id}/history?limit=&after=` + `GET /api/session/{id}/message` | Paged durable history (`SessionHistory{data, hasMore}`). |
| `POST /session/{id}/prompt_async` (`{parts, agent, model}`, 204) | `POST /api/session/{id}/prompt` (`{id?, prompt{text, files, agents}, delivery: "steer"\|"queue", resume?}` → `SessionInputAdmitted{admittedSeq,...}`) | Client-generated `msg_` IDs (idempotency); **model/agent are no longer per-prompt** — set via `POST /api/session/{id}/model` (`{model: ModelRef}`) and `POST /api/session/{id}/agent`. Returns the admitted sequence number instead of fire-and-forget. |
| `POST /session/{id}/abort` | `POST /api/session/{id}/interrupt` | |
| `GET /session` | `GET /api/session?limit=&order=&search=&directory=&project=&workspace=&subpath=&cursor=` | Cursor pagination (`SessionsResponse{data, cursor{previous,next}}`) + server-side search. |
| `POST /session` | `POST /api/session` (`{id?, agent?, model?, location: LocationRef}`) | Location replaces `?directory=` scoping. |
| `GET /session/{id}` | `GET /api/session/{id}` | GET only — see gaps. |
| `GET /permission` + reply | `GET /api/permission/request`, `GET/POST /api/session/{id}/permission`, `POST .../permission/{requestID}/reply` (`{reply, message?}`), `GET/DELETE /api/permission/saved` | New `PermissionV2Request` model incl. saved ("always") permission management. |
| `GET /question` + reply/reject | `GET /api/question/request`, `GET /api/session/{id}/question`, `POST .../question/{requestID}/reply\|reject` | |
| `GET /config/providers` | `GET /api/provider`, `GET /api/model` | Replaces the multi-shape `ProvidersResponse` decoding shims. |
| `GET /agent` / `GET /command` | `GET /api/agent` / `GET /api/command` | Plus new `GET /api/skill`, `GET /api/reference`. |
| `GET /file` / `/file/content` / `/find/file` | `GET /api/fs/list` / `/api/fs/read/*` / `/api/fs/find` | |
| `POST /session/{id}/revert` | `POST /api/session/{id}/revert/stage` → `/commit` (or `/clear`) | Two-phase revert model. |
| — | `GET/POST /api/pty`, `GET /api/pty/{id}/connect` (WebSocket) | Terminal support — future feature (PRD's aspirational shell/PTY). |
| — | `POST /api/session/{id}/wait`, `/compact`, `GET /api/session/{id}/context`, `GET /api/session/active` | New runtime operations. |

### NOT covered by v2 yet (must stay on legacy routes)

- Session mutation: rename/archive (`PATCH /session/{id}`), delete, fork, share, summarize, init, children — `/api/session/{id}` is **GET-only**.
- `GET /session/{id}/todo` and the todo model.
- `GET /session/{id}/diff` (session-scoped diff; new `/vcs/diff` group exists but is separate and not session-message-scoped).
- Project management: `/project`, `/project/current`, `/project/{id}/directories`.
- MCP management: `/mcp` (GET/POST) and MCP auth flows.
- Config: `/config`, `/global/config`.
- Tool listing: `/experimental/tool`, `/experimental/tool/ids`.

## 4. Event model change (biggest architectural delta)

Legacy (what VibePad implements in `SSEClient.swift` + `AppState+SSE.swift` + `MessageStore.swift`):

- Single `/global/event` stream, `data:`-only JSON `{directory, payload{type, properties}}`.
- Coarse events (`message.updated`, `message.part.updated` with optional `delta`), client-side
  directory filtering, "finalize on missing delta" heuristics, and full message reloads on reconnect.

v2:

- `V2Event` union of ~88 typed events with SSE `id:` (event sequence) and `event:` fields.
- Fine-grained streaming: `session.next.text.delta/started/ended`, `session.next.reasoning.*`,
  `session.next.tool.called/input.delta/progress/success/failed`, `session.next.step.*`,
  `session.next.prompt.admitted`, `session.next.revert.*`, plus `session.error`, `session.idle`,
  `file.edited`, `vcs.branch.updated` etc. (several of which VibePad currently has no signal for).
- Durable per-session streams with `?after=<seq>` replay — no more reload-the-world on reconnect.

Migrating chat streaming to this model would replace the delta-append/finalize heuristics and most of
the tolerant multi-shape decoders in `Models/Message.swift` / `APIClient.swift` with a versioned,
schema-tested contract.

## 5. Recommended direction

Hybrid, incremental adoption behind a server-capability check (probe `GET /api/health` once per
connection; keep `HealthResponse.version` as diagnostic):

1. **Phase 0 — deprecation fix (small, ships now):** switch `respondPermission()` to
   `POST /permission/{requestID}/reply`. Works on current servers, removes the only deprecated call.
2. **Phase 1 — v2 session runtime:** per-session durable event stream (`/api/session/{id}/event?after=`)
   + paged history + `prompt`/`interrupt`/`wait`. This is where the user-visible wins are: instant
   reconnect/replay after iPad backgrounding, no reload flashes, correct interleaving of
   text/reasoning/tool deltas, `session.error`/`session.idle` signals.
3. **Phase 2 — v2 reads:** permissions/questions v2, `/api/provider` + `/api/model`, `/api/fs/*`,
   `/api/agent`/`/api/command`; delete the corresponding compatibility decoders.
4. **Keep legacy** for project list/current, MCP, session rename/archive/delete/fork, todo, session
   diff until v2 grows those groups; re-audit on upstream releases.
5. **Floor version:** require server ≥ 1.17.15 for the v2 paths (installed version already qualifies;
   the full current `/api` surface is present there).

Risk note: `/api/*` is explicitly experimental (v0.0.1). Keeping both code paths (legacy fallback)
until upstream de-experimentalizes it is the safe posture, and the tolerant decoders VibePad already
has make the legacy path cheap to keep.

## 6. Sources / verification trail

- Route assembly: `packages/opencode/src/server/routes/instance/httpapi/api.ts` (dev branch).
- v2 contract: `packages/protocol/src/groups/*` (session, message, event, permission, question, fs,
  model, provider, agent, command, skill, pty, reference, location, health).
- SDK v2 export map: `packages/sdk/js/package.json` (`"./v2": "./src/v2/index.ts"`), generated client
  `packages/sdk/js/src/v2/gen/sdk.gen.ts`.
- Spec diff: local `opencode serve` 1.17.15 `/doc` vs dev `packages/sdk/openapi.json` — identical
  `/api|/sync` path sets (55 paths); one deprecated operation total.
