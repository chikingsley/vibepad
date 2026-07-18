# OpenCode native parity matrix

This is the acceptance ledger for the native SwiftCN port of the official OpenCode workspace. The
machine-readable source is `docs/parity/opencode-upstream.json`; this table explains the same scope
for humans. VibePad pins an upstream commit for each parity cut instead of chasing `dev` while the
cut is in progress.

Statuses describe the current VibePad checkout:

- `implemented`: integrated into the shipped path.
- `partial`: useful code exists, but upstream workspace behavior is incomplete.
- `missing`: no integrated native owner yet.
- `covered`: exercised by the current API contract surface.
- `live-only`: requires a disposable OpenCode server.
- `unverified`: no physical-iPad/TestFlight evidence yet.

| ID | Area | Official behavior/source | API contract | Native owner | Implementation | Contract | XCUITest | TestFlight |
|---|---|---|---|---|---|---|---|---|
| `project-home` | Workspace | Project landing and rail | Project list/current | `ContentView` | Partial | Manual | Partial | Unverified |
| `session-tabs` | Workspace | Global session tabs, close/reorder/restore | v2 session list/get | `WorkspaceStore` | Partial | Covered | Partial | Unverified |
| `draft-tab-promotion` | Workspace | Local draft becomes a server session on first send | v2 create/prompt | `WorkspaceStore` | Partial | Covered | Partial | Unverified |
| `chat-timeline` | Chat | Session timeline and rendered turns | v2 message/history | `ChatTabView` | Implemented | Covered | Partial | Unverified |
| `streaming-events` | Chat | Live text, reasoning, tool, idle/error updates | global and session SSE | `SSEClient` | Implemented | Covered | Live only | Unverified |
| `composer-text` | Composer | Multiline prompt, send/stop, draft | v2 prompt/interrupt | `SessionComposer` | Implemented | Covered | Covered | Unverified |
| `composer-context-and-attachments` | Composer | Files, images, selections, context chips | fs find and prompt | `SessionComposer` | Partial | Covered | Partial | Unverified |
| `composer-model-agent-command` | Composer | Model, agent, command/slash selection | model/agent/command | `SessionComposer` | Partial | Covered | Partial | Unverified |
| `permissions-and-questions` | Chat | Interactive request docks/cards | permission/question | Controllers | Implemented | Covered | Partial | Unverified |
| `files` | Review | Browse/search/open project files | v2 fs | `FileStore` | Partial | Covered | Missing | Unverified |
| `review-diffs` | Review | Changes tree and file diff viewer | legacy session diff | `FileStore` | Partial | Covered | Missing | Unverified |
| `review-comments-context` | Review | Line comments and add-to-prompt context | v2 prompt | `ReviewStore` | Missing | Covered | Missing | Unverified |
| `terminal` | Terminal | Session PTY panel | v2 PTY | `TerminalStore` | Missing | Missing | Missing | Unverified |
| `status-services` | Status | Server, MCP, LSP, plugin status | health/MCP/LSP/config | `WorkspaceShellView` (temporary) | Partial | Partial | Missing | Unverified |
| `session-actions` | Sessions | Rename, fork, share, archive, delete | legacy mutations | `AppState+Sessions` | Partial | Covered | Partial | Unverified |

## Evidence policy

The matrix does not treat file presence as proof. A capability advances only with proportionate
evidence:

1. The native owner is integrated into the real app path.
2. Its request, response, and event shapes work against fixtures or a disposable live server.
3. Regression tests are added for a discovered failure or a state transition worth freezing.
4. XCUITest drives the real simulator surface through accessibility identifiers and captures a
   screenshot for visual review.
5. A TestFlight/physical-iPad pass marks the final column verified.

Build and tests run sequentially. Runtime tests must never use or restart the user's active OpenCode
process on port 4096.
