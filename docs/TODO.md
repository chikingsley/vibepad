# VibePad roadmap

This is the active implementation checklist. Items are checked only after the running behavior and required evidence have been reviewed.

The detailed shared, OpenCode, and Codex surface inventory is maintained in [`provider-coverage.md`](provider-coverage.md). This roadmap tracks product order; the coverage document prevents provider features from being forgotten.

## Evidence convention

- [ ] Run each UI slice in an iPad simulator in landscape before marking it complete; add portrait only when checking an explicit adaptive behavior.
- [ ] Give critical landmarks and controls stable `testID` values.
- [ ] Capture an Argent screenshot for each visual milestone.
- [ ] Add a Maestro flow when a user journey becomes behavior we intend to preserve.
- [ ] Record the exact host, simulator, route, and commit used for failed or ambiguous visual checks.
- [ ] Keep generated screenshots, recordings, profiles, and logs untracked unless intentionally promoted into documentation.

## 0. Foundation

- [x] Preserve the Swift application on `archive/swift-native` and the `swift-native-final-2026-07-18` tag.
- [x] Create the Expo 57, React Native, Bun, and TypeScript 7 workspace.
- [x] Add strict Ultracite/Biome, workspace typechecking, and Vitest.
- [x] Add Reanimated motion tokens and reduced-motion behavior.
- [x] Add only the RNR primitives used by the first screen.
- [x] Replace the provisional icon library with typed Nano Icon font families for VibePad UI glyphs and vendored OpenCode provider marks.
- [x] Define the capability manifest and lossless provider-event envelope.
- [x] Add a structural parity guard so OpenCode cannot advertise an operation without a corresponding adapter method; keep end-to-end evidence in the provider coverage checklist.
- [x] Exercise health, provider discovery, project discovery, and v2 session listing against a real OpenCode process.
- [x] Install and globally configure Argent on `home-mac` and `macmini` for Codex and Claude Code, with OpenCode MCP configuration verified.
- [x] Install Maestro CLI and Java 17 on `home-mac` and `macmini`.
- [x] Make `macmini` the canonical SSH alias while preserving `team-mac` and `robsgoto` compatibility aliases.
- [x] Use `home-mac` as the first simulator host and `macmini` as the fallback.
- [x] Prove the Expo Go development loop with Fast Refresh on iPad.
- [x] Capture the current foundation screen as the first visual baseline.
- [x] Add one Maestro smoke flow that opens the Expo development URL and asserts the VibePad shell is visible.

## 1. Canonical workspace shell

### Sidebar inventory

- [x] Build the VibePad-owned RNR sidebar composition using current shadcn/ui, Base UI, and OpenCode behavior as references.
- [x] Use OpenCode's stacked glyph for MCP, LSP, and plugin status while keeping Codex-literal host, working, attention, and error indicators separate.
- [x] Render hosts and their connection state.
- [x] Render workspace rows with folder name on the left and host on the right.
- [x] Expand a workspace to show its recent and active sessions.
- [x] Show idle, working, retrying, permission-needed, and question-needed session state from real provider data.
- [x] Keep offline at the host/workspace boundary instead of inventing an offline session state.
- [ ] Add local unread/attention state when background completion and viewing behavior are implemented; do not alias it to permission or question.
- [ ] Search and filter across hosts, workspaces, and sessions.
- [ ] Support collapsed, overlay, and persistent sidebar modes at iPad, phone, and web breakpoints.

### Active tabs

- [x] Treat each top tab as one active session work context.
- [x] Keep the global new-session control in the shell header so it remains available when the sidebar is collapsed.
- [ ] Prove with Maestro that selecting an already-open session focuses its tab instead of opening a duplicate.
- [x] Preserve explicit harness identity plus host, workspace, and running indicators across the sidebar, active tabs, and assistant timeline.
- [ ] Add local unread indicators once background viewing state exists.
- [ ] Persist and restore the open-tab working set without implying that a closed tab deleted its provider session.
- [x] Close a tab without deleting its provider session and leave a genuinely empty canvas when the working set reaches zero.
- [ ] Support reordering and reopening closed tabs.
- [x] Keep Chat/Preview selection, preview URL, DOM selections, vector strokes, note, and review clock as state within the session work context.
- [x] Keep selected files, additive file tabs, and selected diff as state within the session work context.
- [ ] Keep inspector selection as state within the session work context.

### Main canvas

- [x] Add the initial real timeline and composer regions.
- [x] Remove redundant session chrome and empty-state copy from the canvas.
- [x] Keep Chat mounted while Files, Changes, and Preview open in a right session workbench instead of mixing them with top-level session tabs.
- [x] Open files, structured diffs, and previews in the selected session canvas with landscape inventory/content splits.
- [ ] Evaluate moving the active surface's inventory into a compact left mode switcher at smaller widths without changing the session-local state model.
- [ ] Evaluate a quiet OpenCode-style background watermark without attaching status or explanatory copy to an empty session.
- [ ] Add the contextual inspector region.
- [ ] Support chat-first, preview-first, and split layouts without hard-coding a permanent three-column shell.
- [ ] Validate split, expanded-workbench, and narrow replacement behavior in the landscape iPad simulator and capture the milestone screenshots.
- [ ] Make the inspector collapsible and appropriate for touch targets.
- [ ] Add shared transitions for sidebar, tab, inspector, and layout changes.
- [ ] Capture screenshots for compact iPad, regular iPad, phone, and web.
- [ ] Add a Maestro flow for workspace expansion, session opening, tab reuse, and tab closing.
- [ ] Add a Maestro flow that changes each timeline-opening preference, switches between two mounted session tabs, relaunches the app, and verifies persisted restoration.

## 2. OpenCode vertical slice

### Connection and discovery

- [x] Pair the client with one VibePad host through a ten-minute, one-use `XXXX-XXXX` device-flow-style code, limit each source to five failed attempts per window, keep its bearer token outside preferences, and revoke the device from Connections.
- [x] Show the selected host endpoint and separate host/provider health in an actionable header dropdown; route Add connection to the authenticated pairing flow.
- [x] Reject unauthenticated remote HTTP and WebSocket traffic, store only device-token hashes on the host, and invalidate a revoked token immediately.
- [x] Display host health and OpenCode health separately.
- [x] Load real workspaces from OpenCode project discovery.
- [x] Load real root sessions through the v2 session API without leaking child sessions into the sidebar.
- [ ] Represent loading, empty, offline, authentication, and upstream-error states explicitly.

### Session lifecycle

- [x] Create a session in a selected workspace.
- [x] Rename a session from its sidebar action menu, with long-press on touch and secondary-click behavior on web.
- [x] Open and resume an existing session.
- [x] Load the initial timeline without flattening native provider data.
- [x] Stream ordered v2 session events, reconnect after disconnect, and keep an idle subscription alive beyond Bun's default timeout.
- [x] Resume the OpenCode event stream from its durable provider cursor and prove replay across a disconnected subscription against a real process.
- [x] Send and steer a real turn.
- [x] Archive from the session menu or swipe-left action, remove the archived session from active inventory, and exercise the one-way OpenCode path against a real process with cleanup.
- [ ] Add unarchive only when the provider exposes a real reversible operation; do not offer a fake Undo for OpenCode's archive timestamp.
- [x] Cancel a running turn and treat a successful provider interrupt as authoritative even when no terminal event follows it.
- [ ] Surface child sessions without forcing them into the universal contract before their UI behavior is proven.

### Interactive timeline

- [x] Render user and assistant messages from the real OpenCode timeline.
- [x] Exercise and capture the full, non-truncated reasoning renderer with a real OpenCode history containing four reasoning blocks.
- [x] Render provider activity as compact specialized rows instead of generic cards: grouped context, shell, file changes, reasoning, and a quiet fallback for unmapped tools with raw detail on demand.
- [x] Page provider history behind opaque backward cursors, including three-turn Codex pages and OpenCode v2 message pages, and prepend earlier pages without duplicating overlap or losing the current cursor.
- [x] Render loaded timeline blocks through a recycling-safe Legend List data surface with stable keys, narrow item types, keyed state boundaries, visible-position maintenance, and tail-follow behavior.
- [x] Suspend timeline subscriptions and interaction polling for hidden session tabs while preserving their cached page and semantic reading checkpoint.
- [x] Render dedicated command output, grouped file-read/search/list context, single- and multi-file changes, aggregate and per-file `+/-`, and inline patch/content disclosures from real OpenCode and Codex payloads.
- [x] Project every provider timeline into ordered message and activity blocks without branching the renderer on Codex or OpenCode.
- [x] Preserve Codex commentary/final-answer phases and conservatively infer only completed trailing OpenCode prose as a final answer.
- [x] Open and reactivate sessions at the start of the latest final answer, keep that semantic anchor stable during late layout, and show a floating jump-to-latest control only after the reader leaves the tail.
- [x] Collapse one Codex turn's activity behind a provider-literal summary, including running shimmer/spinner treatment and completed action counts.
- [x] Render permission and question requests with actionable controls, and quietly poll as a fallback when a request is absent from the durable event feed.
- [ ] Render todos and activity state.
- [x] Show the active model and provider from live OpenCode data.
- [x] List and search the real provider/model catalog, switch the active model, and switch between the real `build` and `plan` primary agents.
- [ ] Preserve a provider-native detail view for unmapped events.
- [x] Add a Maestro flow for a real send and stream-completion journey.
- [ ] Add Maestro flows for cancel, permission, and question-response journeys.
- [ ] Capture screenshots of every timeline item family before promoting the renderer as complete.

### Files and changes

- [x] List and read real project files through the generated OpenCode v2 SDK.
- [x] Load structured working-tree diffs through OpenCode v2 VCS rather than parsing shell output.
- [x] Show per-file and aggregate folder additions/deletions in Files.
- [x] Make an ordinary file tap replace the selected file and long-press retain another file as an additive tab.
- [x] Render a selectable file and a virtualized colored patch in landscape.
- [x] Exercise list/read/diff against a real OpenCode process and through the VibePad host routes.
- [x] Defend file open, Files/Chat retention, and Changes navigation with `.maestro/files-changes.yaml` on the landscape iPad simulator.
- [ ] Add file search, changed-file filtering, branch diff mode, and explicit binary/image preview behavior.

## 3. Preview and browser loop

### Universal preview surface

- [ ] Define the preview URL, lifecycle state, logs, and metadata contract.
- [x] Render browser previews with a web frame on web.
- [x] Render remote URLs with `react-native-webview` on iOS and Android.
- [x] Add reload, back, forward, and open-external controls.
- [x] Disable back and forward until the current browser target reports usable history, and keep native WebView navigation state authoritative.
- [x] Remove the redundant Preview title strip and keep navigation, external, expand, and close controls in one browser toolbar.
- [ ] Add viewport and connection-state controls.
- [x] Add Select and Draw modes over the same preview: preserve normalized selection points, DOM metadata when hit-testing is available, and vector strokes with cue-relative timestamps.
- [x] Keep coordinate-only selection as the explicit cross-origin fallback and use DOM hit-testing for same-origin web content and injected native WebView content.
- [x] Send a timecoded selection/stroke/note bundle to a real OpenCode session and clean up the tagged test session afterward.
- [x] Preserve preview feedback when switching Chat/Preview and when switching between open session work contexts.
- [x] Put timestamped review captures in the existing chat composer in split view and show the same draft in a floating Cancel/Send tray only when Preview hides chat.
- [x] Defend native select, draw, retention, and clear behavior with `.maestro/preview-feedback.yaml` on the landscape iPad simulator.
- [ ] Add screenshot attachments without flattening or discarding the vector and DOM feedback payload.
- [x] Select the timestamped capture strip from `/design/attachments` and keep one shared review draft, composer, and attachment primitive.
- [x] Use `/design/preview-fixture` as a real interactive component playground instead of recursively previewing VibePad inside itself; make Select snap to semantic controls and explicit test/component boundaries.
- [x] Add session-local browser tabs with independent URL, history, loading state, and mounted native/web page state; convert native new-window requests into another VibePad tab.
- [x] Keep native preview browsing out of incognito mode with cookies, shared cookie storage, DOM storage, and cache explicitly enabled.
- [x] Make browser-tab close target-only: it must not stop a dev server, browser profile, host process, or harness session, and closing the last page only hides Preview.
- [ ] Define the host browser-broker contract for profile create/list/select/clear/isolate, target open/list/focus/close, navigation, input, screenshot/stream, downloads, and crash recovery.
- [ ] Move page targets and authenticated profiles to the host preview broker so a named persistent profile can retain cookies, local storage, IndexedDB, service workers, cache, logins, and history across devices.
- [ ] Back each named profile with a real host Chrome/Chromium user-data directory, keep disposable cache separate, and enforce one broker-owned process lock per active profile.
- [ ] Keep raw CDP/browser-control ports private behind the host API, authenticate the local control seam, and recover targets after a browser or host restart.
- [ ] Stream and control the broker's exact page target in VibePad; never imply that loading the same URL in a second WebView shares the browser session.
- [x] Pin Agent Browser 0.32.2 in the blank-host installer, install a compatible Chrome for Testing, and pass a real headless launch doctor on both GMK and Hojo without changing global packages.
- [ ] Expose broker-backed browser tools to VibePad-launched harnesses without requiring a separate manual install; GMK's cookie/local-storage restore and dashboard checks pass, while a fresh full-profile restart currently loses its daemon connection and remains an acceptance blocker.
- [ ] Route VibePad-launched harnesses to the selected broker profile through the installed browser MCP/tool configuration while leaving independently launched harnesses opt-in.
- [ ] Add a human-visible first-login flow, persistent profile selection, and explicit clear/isolate operations without exposing credentials to agents.
- [ ] Support remote hosts without a physical display in headless mode and keep a headed or virtual-display fallback for incompatible sites; GMK proves the headless and dashboard path, while Xvfb is absent and the headed fallback remains unproved.
- [ ] Represent profile and target ownership as host/control-plane resources so concurrent agents coordinate leases with the human and one another.
- [ ] Prove that human interaction and agent navigation operate on the same browser target instead of showing two diverging mirrored sessions.
- [ ] Prove cookie/login, tab, download, and history persistence across app, host, and browser restarts, plus explicit profile clearing and isolation.
- [ ] Prove Fast Refresh while the preview remains open.

### Voice and review capture

- [x] Add first-class session dictation with a Codex-style composer takeover, stop, transcribe-and-send, bounded waveform, and cursor-aware insertion.
- [x] Capture foreground PCM through Expo Audio, normalize it to 16 kHz mono linear16, and proxy Scribe Realtime through the trusted host so the Voice Lab credential never ships in the client.
- [x] Prove the host bridge with two real WebSocket servers, an authenticated upstream handshake, binary PCM, and a terminal transcript.
- [x] Load the Peacockery language-model catalog and run optional coding or light transcript cleanup through the exact generated HTTP client, while keeping the raw transcript authoritative on cleanup failure.
- [x] Exercise the generated-client catalog and cleanup routes against Voice Lab with a real host credential: the live catalog returned 19 language models, and `google-gemini-3.1-flash-lite` cleaned a dictated coding request successfully.
- [x] Mint, cache, and refresh a least-privilege Voice child token per VibePad installation from the internal host-side parent lab key; keep both credentials out of Expo.
- [x] Exercise a four-scope child against Voice Lab with real installation and device metadata, load the 26-model language catalog, revoke the child, and independently confirm its revoked status.
- [x] Persist a stable random installation UUID plus app, client, device-model, platform, and OS metadata at pairing, then attach the existing Peacockery metadata headers to HTTP and realtime Voice traffic for training provenance.
- [ ] Put the production child-token minting parent in a Peacockery-controlled service before distributing VibePad outside the trusted internal host fleet.
- [x] Add canonical Peacockery Voice DPoP child binding, ES256 request verification, a five-minute server nonce, hashed proof-ID replay rejection, OpenAPI fields, generated TypeScript nonce retry, and regenerated Swift schema; local migration, strict checks, 55 contract tests, and a Swift 6.3.3 build pass.
- [ ] Add the VibePad native Secure Enclave signer and entitlement-mediated direct mint flow, exercise bound HTTP and realtime traffic on physical iPad, and evaluate App Attest registration/assertions as a separate Apple app-instance hardening layer.
- [ ] Run start, stop, cancel, permission denial, no-speech, retry, and physical microphone capture on a landscape iPad dev build before promoting voice.
- [ ] Validate the implemented bounded realtime-interim setting on a landscape iPad dev build; keep it off by default and prove it never grows over the conversation.
- [ ] Capture a microphone stream during a review and align transcript spans with selection and drawing cue timestamps.
- [ ] Add a floating bottom-right capture control only when microphone capture gives it a real start/stop/send lifecycle; Select and Draw currently start the review clock on the first cue without a separate Review Live button.
- [ ] Test real Apple Pencil pointer identity and pressure on hardware; the simulator proves gestures but cannot prove physical Pencil pressure.
- [ ] Keep ordinary dictation, concise spoken notifications, and the global conversational orchestrator as three distinct voice scopes.
- [ ] Add the hold-to-talk/drag interaction only after the button-driven Select/Draw while talking flow is proven on hardware.
- [ ] Add an explicit voice-command send path after transcript alignment and accidental-send behavior are measurable.

### Host preview broker

- [ ] Implement `start`, `status`, `logs`, `stop`, and `expose` operations.
- [ ] Detect and reuse existing preview processes instead of duplicating them.
- [ ] Track owner, host, workspace, process, port, URL, readiness, and cleanup.
- [ ] Stop a process automatically only when it is explicitly broker-owned and ephemeral and its last dependent target closes; persistent and manually started processes require an explicit Stop operation.
- [ ] Support ordinary web dev servers first.
- [ ] Add Portless or an equivalent stable local naming layer.
- [ ] Add remote reachability through the selected private transport.

### Simulator surfaces

- [ ] Evaluate Argent Lens as the default Mac-side interactive simulator surface using a real VibePad session.
- [ ] Evaluate ServeSim only where its streamed browser surface or WebKit inspection is materially better than Argent Lens.
- [ ] Do not run both as mandatory overlapping backends.
- [ ] Embed the selected simulator URL through the universal preview contract.
- [ ] Prove tap, type, swipe, rotate, screenshot, logs, and reconnect from the VibePad client.

## 4. Agent-driven UI development

- [ ] Add an Argent setup document for Codex, Claude Code, and OpenCode.
- [ ] Standardize the agent loop: run, inspect, interact, capture, compare, repair, rerun.
- [x] Store deterministic Maestro flows under `.maestro/`; eight focused shell, session, provider, files, preview, and browser flows are present.
- [ ] Use Maestro subflows for pairing, workspace selection, and session setup.
- [ ] Keep exploratory Argent trajectories out of the permanent regression suite unless they expose behavior worth defending.
- [ ] Add a command that runs the relevant Maestro flow and emits evidence metadata in one operation.
- [ ] Promote release/profile-mode performance budgets for first render, session open, long-timeline scrolling, and streamed updates after physical landscape iPad measurement; the initial web baseline and payload reductions are recorded in `timeline-rendering.md`.
- [ ] Use Argent profiling to investigate regressions instead of adding broad synthetic unit coverage.

## 5. Connectivity and native boundary

### Development build backlog

- [ ] Keep Expo Go as the default loop until a selected feature actually needs native code.
- [ ] Add `react-native-streamdown` behind platform-specific message-content components for enriched native Markdown; keep the timeline protocol renderer-independent.
- [x] Add `react-native-webview` for the universal preview surface's native implementation.
- [ ] Evaluate native document, share, file, microphone, and voice components against Expo modules before adding custom native code.
- [ ] Decide whether Nano Icon fonts need static native linking; the current Expo font loading path is sufficient for Expo Go.
- [ ] Create the development-client build, signing, entitlement, local build, and EAS build/release configuration together instead of accumulating accidental native requirements one package at a time.
- [ ] Preserve a web fallback for every native-only renderer or preview surface.

### Default connection path

- [x] Keep remote client traffic on the host's authenticated HTTP/WebSocket API, including bearer authentication through a WebSocket subprotocol instead of a URL query.
- [x] Pair a client with a host without requiring an SSH implementation inside the Expo application.
- [x] Select direct Tailscale reachability by MagicDNS name and host port for home, team, and remote tailnet Macs; Tailscale Serve and an in-app SSH tunnel are outside the ordinary traffic path.
- [x] Discover and bind installed VibePad Host to the machine's Tailscale address while retaining loopback development access and requiring an explicit opt-in for `0.0.0.0`; the GMK service is live at `100.121.185.11:4100` and reachable as `http://gmk:4100` from Hochi and Hojo.
- [x] Declare iOS local-network access for direct HTTP through unqualified MagicDNS machine names.
- [ ] Prove `http://gmk:4100`, `http://hochi:4100`, and `http://hojo:4100` across health, JSON, NDJSON streaming, and Voice WebSocket routes in the development client; a temporary GMK host already proved direct MagicDNS health, pairing, and authenticated JSON from Hochi and Hojo.
- [ ] Finish the remote-access threat model for URL exposure and private reachability; local host authentication, device revocation, hashed token storage, and native credential separation are implemented.

### Blank-host bootstrap and recovery

- [x] Define one checkout bootstrap command that installs pinned Bun when needed, installs VibePad Host, detects the system inventory, requests consent, and keeps version-matched Codex/OpenCode/Agent Browser packages isolated under VibePad application data.
- [x] Implement VibePad Host lifecycle management as a LaunchAgent on macOS and a systemd user service on Linux with endpoint-aware health, restart, logs, and state-preserving uninstall operations; GMK supplies the live systemd acceptance and the generated LaunchAgent passes `plutil` on Hochi.
- [ ] Recreate the archived Swift onboarding behavior as an Expo/host contract: checking, install, start, connect, paired, offline, retry, and recovery states.
- [ ] Keep password or key-based SSH outside the Expo client as a bootstrap/recovery transport, verify host keys, and authorize a durable device key when that flow is selected.
- [x] Hand provider-owned authentication back to Codex and OpenCode, verify each selected harness before emitting the pairing URL and code, and leave later Claude Code support outside the current provider set.
- [x] Run the macOS acceptance on Hojo: install the isolated pinned toolchain, start the real LaunchAgent and managed OpenCode child, pair, open an existing 81-item timeline, restart and reconnect with the same token, revoke it, remove the exact test-device rows, uninstall, prove state preservation and closed ports, then reinstall idempotently.
- [ ] Run the equivalent blank-host bootstrap and recovery acceptance on a clean Linux user account, including the optional headed-browser system dependencies.

## 6. Provider expansion and coordination

- [x] Use Codex as the second provider to challenge the OpenCode-earned contract.
- [x] Add provider-specific controls only when they cannot be expressed as a stable VibePad operation.
- [ ] Add a landscape iPad Maestro journey covering Codex session creation, model/reasoning/mode selection, send, stream, and cleanup.
- [x] Exercise app-server restart/reconnect, isolated authentication failure, generated-binding version mismatch, and malformed output before calling provider failover complete.
- [ ] Add Claude Code after the common session and timeline boundaries survive the Codex integration.
- [ ] Integrate agent-bus discovery and lifecycle state into the host.
- [ ] Show agents, handoffs, safe-point pause requests, and resource leases in a coordination surface separate from chat transport.
- [ ] Exercise cross-harness handoff and resource negotiation with real Codex, Claude Code, and OpenCode processes.

## Milestone gates

### M1: Navigable shell

- [x] Sidebar and working tabs operate on real OpenCode projects and sessions.
- [ ] Adaptive screenshots are reviewed.
- [x] Shell Maestro flow passes.

### M2: Real conversation

- [x] A user can create or resume a session, send a turn, observe streaming, answer an interaction, and cancel work.
- [ ] Timeline-family screenshots are reviewed.
- [ ] Conversation Maestro flows pass.
- [x] Real Files and Changes can be inspected within the active session context on web and iPad.

### M3: Preview-first dogfood loop

- [ ] A host preview is launched by the preview broker, displayed, annotated, and returned to an agent from VibePad.
- [x] A manually supplied web/native preview URL can be selected and drawn on, and its structured timecoded feedback can be returned to a real agent.
- [ ] Argent can independently inspect and interact with the same running app.
- [x] The Select/Draw preview Maestro flow passes on the landscape iPad simulator.

### M4: Remote iPad workflow

- [ ] VibePad can pair with a remote Mac, open a session, inspect its preview, and continue work without manually operating that Mac.
- [ ] The selected transport has authentication, revocation, and reconnect evidence.
