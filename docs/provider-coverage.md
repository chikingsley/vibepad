# Provider coverage

This is VibePad's detailed implementation and verification inventory. It is deliberately broader than the active roadmap so provider capabilities do not disappear when the product works through one vertical slice at a time.

Checkboxes mean VibePad behavior, not merely an upstream endpoint:

- `[x]` is implemented and exercised against a real harness process.
- `[ ]` is missing, incomplete, or not yet exercised end to end.

An upstream capability can be surveyed without being checked. Provider-only features remain available through native detail or provider controls; they do not enter the universal contract merely because an endpoint exists.

Manifest support is narrower but still not the same as this checklist: it means the provider adapter exposes a typed operation. A regression check maps every non-unsupported OpenCode or Codex manifest entry to a real `HarnessAdapter` method. The checkboxes below remain the end-to-end standard across adapter, host, client, real provider process, and user-visible behavior.

## Audit snapshot

- OpenCode runtime exercised on `gmk-server`: 1.18.2.
- OpenCode generated TypeScript SDK in the workspace: 1.18.3, with v2 used where available.
- Codex runtime exercised on `gmk-server`: `codex-cli 0.144.6` app server.
- Codex bindings are generated from that installed app server and reduced to the exact transitive closure used by `packages/provider-codex`.
- OpenCode and Codex are registered concurrently behind one host router and exercised through the same HTTP and NDJSON client contract.

Version drift is expected. Regenerate or re-audit upstream types before each provider implementation slice rather than hand-maintaining an assumed API.

## Shared VibePad contract

### Identity and discovery

- [x] Identify a host separately from its provider process.
- [x] Discover provider workspaces/projects with stable IDs and paths.
- [x] Identify a durable provider session within a workspace and host.
- [x] Route provider-qualified session IDs after a fresh host/router start, while accepting legacy raw OpenCode session IDs during migration.
- [x] Retain complete provider-native values alongside projected summaries.
- [x] Advertise operation support through a capability manifest.
- [x] Reject OpenCode and Codex manifest claims that are not backed by adapter methods.
- [x] Pair and authenticate a client with a host through a short-lived one-use code, retain only the token hash on the host, and revoke the device from the rendered Connections surface.
- [x] Discover multiple providers on one host.
- [ ] Merge workspaces from multiple hosts without path or ID collisions.
- [ ] Represent provider account and authentication state.

### Session and turn lifecycle

- [x] List root sessions.
- [x] Create a session in a selected workspace.
- [x] Resume an existing session.
- [x] Rename a session.
- [x] Send or steer user input.
- [x] Represent idle and working state.
- [x] Represent retrying, permission-needed, and question-needed as distinct session states, with offline remaining a host/workspace state.
- [x] Archive a session when supported and remove it from active inventory.
- [x] Cancel or interrupt an active turn from the client.
- [ ] Unarchive, delete, fork, and share when supported.
- [ ] Revert, roll back, or rewind through a provider-neutral intent with provider-owned constraints.
- [ ] Compact context without pretending providers use one identical mechanism.
- [ ] Surface child or subagent sessions with durable parentage.
- [ ] Hand off a session to another harness without claiming process takeover.

### Timeline and interaction

- [x] Load a bounded timeline snapshot.
- [x] Stream ordered provider events and preserve the native envelope.
- [x] Render user and assistant text.
- [x] Project reasoning without truncating its stored content.
- [x] Reconcile a completed streamed turn with its durable history.
- [x] Resume an OpenCode stream from its durable cursor after disconnect.
- [ ] Render tool lifecycle, terminal output, file reads, patches, and diffs.
- [ ] Render plans, todos, warnings, notices, token usage, and context state.
- [ ] Render attachments, images, and rich content.
- [x] Answer permission and approval requests.
- [x] Answer structured provider questions.
- [ ] Answer MCP elicitation requests.
- [ ] Preserve an inspectable fallback for every unmapped native event.
- [ ] Virtualize and measure long timelines on native and web.

### Models and provider controls

- [x] Display the active harness provider and model.
- [x] List all available providers and models through a searchable combo box.
- [x] Change the model for a new or existing session where supported.
- [x] Change reasoning effort and collaboration mode only when exposed.
- [ ] Change summary, personality, verbosity, or service tier only when exposed.
- [ ] Render provider-only controls from typed manifest metadata.
- [ ] Explain unavailable controls rather than hiding provider differences.

### Files, commands, and services

- [x] Read and list files through the host using the provider's generated API.
- [ ] Search files and symbols through the host.
- [x] Show structured working-tree status counts and patches.
- [ ] Run commands and maintain interactive PTYs.
- [ ] Display MCP servers, tools, resources, and authentication state.
- [ ] Display LSP and formatter state separately from provider health.
- [ ] Display skills, plugins, agents, and slash commands when available.
- [ ] Feed host preview lifecycle and logs into the same session work context.

## OpenCode coverage

The adapter uses the generated SDK rather than reproducing OpenCode transport. Stable product concepts are projected into `@vibepad/protocol`; full OpenCode objects remain available as `native` data.

### Connection and inventory

- [x] Query real server health and version.
- [x] Connect to an OpenCode server protected by HTTP Basic authentication, using the official server username/password environment contract.
- [x] List projects through the generated project endpoint.
- [x] List root sessions through v2.
- [x] Fetch session status separately from session identity.
- [x] Normalize empty-session project identity from `location.directory` when OpenCode reports `projectID: global`.
- [x] Keep concurrent project discovery to one in-flight request.
- [ ] Expose archived sessions separately and add pagination/search controls.
- [ ] Expose experimental workspace adapters, copies, sync, warp, and status as provider-specific surfaces before considering universal equivalents.
- [ ] Handle OpenCode upgrade and instance disposal outside ordinary session UI.

### Session operations

- [x] Create through v2 with an explicit location.
- [x] Rename through the generated stable session-update endpoint while v2 has no title-update operation.
- [x] Load and resume a durable session.
- [x] Send text through v2 prompt delivery with `steer` semantics.
- [x] Subscribe to v2 session events with downstream cancellation propagation.
- [x] Abort a running session from the UI and prove the provider state.
- [ ] List and display child sessions.
- [ ] Fork a session at a selected message.
- [x] Archive a session one-way, filter it from active inventory, and prove the operation against a real process with test cleanup.
- [ ] Delete a session with confirmation and recoverability semantics.
- [ ] Unarchive only if a future OpenCode API can clear the archive timestamp; the current generated API cannot provide honest Undo semantics.
- [ ] Share/unshare a session and explain remote exposure.
- [ ] Revert, unrevert, and compact/summarize from explicit controls.
- [x] Switch active model and agent in a session.
- [ ] Run named session commands and shell requests.
- [ ] Display todos, diffs, context usage, and history.
- [ ] Evaluate background subagent detachment as an OpenCode-native control.

### OpenCode timeline families

- [x] User text messages.
- [x] Assistant text messages.
- [x] Reasoning parts retained in full.
- [x] Tool calls, inputs, lifecycle status, results, and errors through the adapter and expandable web-client cards.
- [ ] Incremental tool progress and provider-specific tool metadata.
- [ ] Shell commands, streaming output, exit state, and terminal interaction.
- [ ] File reads, writes, patches, diffs, and source locations.
- [ ] Attachments, images, links, and structured output.
- [ ] Permission requests, saved rules, replies, and rejection.
- [x] Question requests, a single selected answer, and replies.
- [ ] Multiple question answers and rejection.
- [ ] Todos, compaction, revert state, retry state, warnings, and errors.
- [ ] Child/subtask activity and background agent state.
- [ ] Provider-native fallback view with copyable JSON and event metadata.

### OpenCode extended surfaces

- [ ] Provider catalog, authentication methods, OAuth, and credentials.
- [x] Models, variants, agents, skills, and commands through the typed catalog; model and primary-agent selection are user-facing.
- [ ] Provider tool inventory and named-command execution controls.
- [x] Display MCP connection/auth-attention status, LSP status, and configured plugins in the shared status surface.
- [ ] MCP add/connect/disconnect/auth flows and resources.
- [x] File list and read through the generated v2 API.
- [ ] File status and text/file/symbol search.
- [x] Structured working-tree diff through the generated v2 VCS API.
- [ ] VCS status, raw/branch diff, apply, and project Git initialization.
- [ ] PTY create/list/connect/resize/remove and supported shells.
- [ ] Worktree create/list/reset/remove.
- [ ] TUI interoperability controls remain provider-specific and optional.
- [ ] Sync history/replay/start/steal is assessed before it overlaps agent-bus.
- [ ] Integration, credential, reference, and project-copy v2 surfaces are classified as product, admin, or provider-detail behavior.

### OpenCode verification journeys

- [x] Shell smoke on the iPad simulator.
- [x] Open and render a real existing session.
- [x] Send a real turn and observe completion.
- [x] Keep an inactive subscription alive beyond Bun's default timeout.
- [x] Cancel a client subscription and prove upstream resource cleanup.
- [x] Disconnect and resume a real subscription from its durable cursor without reloading the complete timeline.
- [x] Create and rename a real session in a chosen workspace with Maestro.
- [x] List/read a real file and load structured VCS changes through the adapter and host, then exercise Files/Changes on web and iPad.
- [x] List the real provider catalog in the host and web client, search 178 enabled models, switch to `opencode/hy3-free`, switch the primary agent to `plan`, and delete the disposable session.
- [x] Reuse an already-open OpenCode session tab without duplication in the running web client.
- [x] Cancel a real running turn from VibePad and prove OpenCode is inactive without the forbidden completion marker.
- [x] Answer a real permission request from the web client.
- [x] Answer a real structured question from the web client and render the completed question tool plus the provider's exact final response.
- [x] Load a real 1.18.3-written session whose 1.18.2 v2 session/message and interaction projections return HTTP 500, fall back to stable endpoints, and render its reasoning plus eight expandable tool calls without a 503.
- [ ] Exercise every supported timeline family and capture screenshots.
- [x] Reject missing credentials and connect successfully with valid credentials against a real password-protected OpenCode process.
- [x] Exercise the generated 1.18.3 SDK against the installed 1.18.2 runtime, including stable-endpoint fallback for incompatible v2 session history.
- [ ] Exercise host offline/reconnect behavior and malformed provider data.

## Codex coverage

Codex is implemented as a host-side app-server adapter. VibePad generates bindings from the installed Codex version and speaks its newline-delimited request, response, server-request, and notification protocol over stdio. The Expo client never owns a Codex process or stdio stream.

The current app server advertises `stdio://`, Unix socket, and WebSocket listeners. Local host integration owns one stdio child. Remote WebSocket is optional and must use its advertised capability-token or signed-bearer-token authentication rather than becoming VibePad's default transport by accident.

### Adapter foundation

- [x] Add `packages/provider-codex` with generated bindings isolated from the provider-neutral protocol.
- [x] Record the audited Codex CLI/protocol version and add an explicit, reproducible binding-regeneration command.
- [x] Launch app server through the host, perform `initialize`, then send `initialized` on the exact stdio wire.
- [ ] Detect daemon/proxy versus directly owned process lifecycle.
- [x] Map request IDs, responses, server requests, notifications, timeouts, child exit, stderr diagnostics, and owned-process disposal.
- [x] Reinitialize after owned-process disconnect, replay explicitly marked reads once, never replay mutations, and discard connection-scoped callbacks and adapter caches.
- [x] Journal exact native events before broadcast and reconcile them with the resumed app-server snapshot so completed shell activity survives a full adapter/app-server restart exactly once.
- [ ] Preserve every native request, response, notification, and response item.
- [x] Preserve complete native thread items on projected timeline entries.
- [x] Advertise only operations backed by adapter methods and exercised against a real Codex process.

### Threads and turns

- [x] List, read, start, resume, and identify loaded root threads.
- [ ] Add VibePad thread search and pagination controls.
- [x] Archive threads and remove them from active inventory.
- [ ] Fork, unarchive, expose delete with product confirmation, and unsubscribe threads.
- [x] Set thread names.
- [ ] Edit provider-native thread metadata.
- [x] Start, interrupt, list, and inspect turns and their full item view.
- [x] Treat a newly started, unmaterialized thread as an empty timeline instead of a failed session.
- [x] Track memory-only thread ownership by app-server generation, reject an empty thread after its owning process dies instead of creating a ghost turn, and resume durable threads before timeline reads.
- [ ] Inject items only as an explicit Codex-native control.
- [ ] Compact and roll back with the exact Codex semantics.
- [ ] Surface thread goal, memory mode, settings, token usage, and status.
- [ ] Surface background terminals without conflating them with turns.
- [ ] Prove session identity across CLI, app-server, editor, and subagent sources.

### Codex timeline families

- [x] User and agent messages, including live completion through the Expo UI.
- [x] Prove the implemented reasoning-summary and retained-content projection through the Codex UI.
- [ ] Prove the implemented plan-to-reasoning projection through the Codex UI.
- [x] Prove the implemented command lifecycle and aggregated-output projection through the Codex UI; the live adapter already returns a shell item.
- [ ] Prove terminal-input interaction and incremental command output in the UI.
- [x] Prove the implemented file-change and diff projection through the Codex UI.
- [ ] Prove the implemented MCP and dynamic-tool projection through the Codex UI.
- [ ] Prove the implemented web-search and image-generation provider detail through the Codex UI.
- [ ] Prove the implemented collaboration-call and subagent-activity projection with a real subagent run.
- [ ] Warnings, errors, deprecations, moderation, model reroute, and safety state.
- [ ] Prove the implemented context-compaction timeline item with a real turn.
- [ ] Surface token and context-window updates.
- [ ] Raw response-item fallback for unmapped material.

### Codex interactive requests

- [x] Command-execution approval, including session acceptance and policy amendments.
- [ ] File-change approval.
- [ ] General permission approval.
- [x] Tool request-user-input forms with structured answers.
- [ ] MCP elicitation accept, decline, and cancel responses.
- [ ] Dynamic tool callbacks.
- [ ] Guardian-denied action review.
- [ ] Authentication-token refresh and attestation requests remain host-owned.

### Models, modes, and configuration

- [x] List real models, supported reasoning efforts, and provider capabilities.
- [x] Select the model and reasoning effort from the shared Expo controls.
- [x] Select real Default and Plan collaboration modes.
- [ ] Select provider, service tier, reasoning summary, verbosity, or personality only where the app server permits it.
- [ ] List permission profiles and display active approval/sandbox policy.
- [ ] Read settings and config requirements without leaking secrets.
- [ ] Write configuration only through explicit admin controls.
- [ ] Surface experimental features without making them universal defaults.

### Codex commands, files, and review

- [ ] Execute, write to, resize, and terminate command sessions.
- [ ] Spawn, write to, resize, and kill host processes only through a separate privileged host boundary.
- [x] Exercise the implemented read/list filesystem operations with project path confinement through the Codex Files UI.
- [ ] Watch/write/copy/remove files with clear authorization and destructive-action guards.
- [ ] Fuzzy-search files and support incremental search sessions.
- [x] Exercise the implemented Git diff-to-remote projection through the Codex Changes UI.
- [ ] Start Codex review flows and prove patch/review rendering in the UI.

### Codex services and account state

- [ ] Display the implemented project-skill catalog in a user-facing surface.
- [ ] Surface skill enabled state, extra roots, and change notifications.
- [ ] List apps and update notifications.
- [x] Prove the implemented MCP startup/auth state and tool-count projection in the Codex status UI.
- [ ] Surface MCP resources, templates, OAuth flows, calls, and resource reads.
- [ ] List plugins and install/uninstall/share only in an admin surface.
- [ ] Read account, login mode, workspace messages, usage, and rate limits.
- [ ] Display rate-limit exhaustion as actionable session/host state.
- [ ] Evaluate remote-control pairing as a Codex-native surface, not as a replacement for VibePad host pairing without a security review.
- [ ] Keep marketplace, feedback, environment, and external-agent import outside the core conversation contract unless a product journey earns them.

### Codex realtime and collaboration extensions

- [ ] Classify realtime WebSocket/WebRTC voice sessions as an optional VibePad voice surface rather than baseline text transport.
- [ ] Map realtime transcript, output audio, voice list, and lifecycle events.
- [ ] Prove collaboration modes and subagent sources without flattening them into agent-bus peers.
- [ ] Reconcile Codex-native subagents with cross-harness agent-bus discovery, handoff, pause requests, and resource leases.
- [ ] Prove a real Codex subagent run before promoting any shared coordination concept.

### Codex verification journeys

- [x] Start the real installed app server and verify current account-backed health and version.
- [x] Discover Codex projects and existing root threads beside OpenCode without ID collisions.
- [x] Create, rename, select model/reasoning/mode, send, stream, archive, and delete a disposable real thread.
- [x] Answer a real `request_user_input` callback and complete the same turn.
- [x] Approve a real harmless command and render its shell timeline item.
- [x] Interrupt a real turn while it is paused on an approval request, verify it returns idle without the forbidden response, and delete the thread.
- [x] Route a real Codex turn through the same host HTTP/NDJSON transport as OpenCode.
- [x] Create a Codex session in the Expo UI, switch Sol reasoning to Low, send a real turn, and render its exact response.
- [x] Repeat Codex creation and an exact-response turn in the landscape iPad simulator with Maestro, then delete the disposable thread from both active and archived Codex inventory.
- [x] Delete every tagged disposable thread and verify both active inventories contain no `VIBEPAD` probes.
- [x] Exercise Codex interrupt from the client UI and verify the stopped turn does not emit its forbidden assistant response.
- [ ] Add a landscape iPad Maestro journey for the promoted Codex path.
- [x] Exercise real app-server restart and isolated authentication failure, reject generated-binding/runtime version skew in the live runner, and recover a safe read after malformed provider output. A fresh-process post-suite audit waits for or removes every tagged test thread.

## Provider promotion gates

A provider slice is not complete because its API compiles. Before promotion:

- [x] The relevant generated types match the real installed harness version.
- [x] The adapter advertises only exercised capabilities.
- [x] Create/resume, send, stream, interrupt, and one interactive request run against a real process where the provider supports them.
- [x] Native payloads remain inspectable for mapped and provider-detail behavior.
- [ ] iPad Maestro journeys and screenshots cover the promoted path.
- [x] Reconnect, cancellation, authentication, version-skew, and malformed-data behavior are measured.
- [ ] Provider-specific features remain available without distorting the shared contract.
