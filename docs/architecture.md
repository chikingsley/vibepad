# Architecture

## Runtime split

VibePad has two product runtimes:

1. The universal Expo client renders projects, sessions, chat, files, previews, and coordination state.
1. The host service owns harness processes, provider adapters, filesystem access, preview lifecycle, and local coordination integrations.

The client communicates with the host through a versioned HTTP streaming protocol. It never launches local harness or preview processes itself. Ordinary JSON requests carry snapshots and turns, while an NDJSON response carries ordered provider events. Long-lived event responses disable Bun's per-request idle timeout; otherwise an inactive session is silently disconnected after ten seconds. Downstream cancellation propagates through the provider boundary with `AbortSignal` so reconnects do not leave orphaned OpenCode SSE connections or Codex event subscriptions. The client transport may move to WebSocket when multiplexing or bidirectional control earns that complexity without changing the provider-neutral event envelope.

One host can register several adapters. `ProviderRouter` aggregates provider manifests, health, projects, and sessions, then routes each qualified project or session ID back to its owner. Codex and OpenCode IDs are explicitly namespaced, so a fresh router can recover ownership after a host restart without first rebuilding an in-memory discovery map. The router temporarily accepts OpenCode's former raw `ses_*` form so already-open tabs survive the migration. A failed provider health check therefore degrades its own inventory without erasing a healthy peer. Client event reconnects use bounded exponential backoff and reset only after the provider actually yields another event, avoiding a tight request loop while a host or provider remains unavailable.

OpenCode transport remains owned by its generated SDK. A blank-host install pins the matching OpenCode binary in VibePad application data and starts a Basic-authenticated, loopback-only `opencode serve` child with the host. An explicit external server remains supported, but leaving an unrelated manual process on port 4096 is not the default lifecycle. Codex transport remains host-local: the host starts `codex app-server --listen stdio://`, exchanges newline-delimited requests, responses, server requests, and notifications, and disposes the child on host shutdown. The generated Codex binding set records the installed CLI version and contains only the transitive type closure used by the adapter. Remote app-server WebSocket access is not the default VibePad client transport and must not bypass host pairing or app-server authentication.

Provider events that are required to reconstruct the visible timeline cross a durable host seam. The host stores the exact provider event and native payload in SQLite before publishing it to a client. Codex then reconciles this journal with `thread/turns/list` after an app-server restart because the canonical list can omit completed command items. Chat Sync remains an archive, search, and future repair source; the interactive UI does not depend on a second service or SSH search to render a turn it already observed.

## Client preferences and credentials

Client preferences use a versioned `AppSettings` schema. Version 2 owns timeline-opening behavior, voice preferences, saved host metadata, and the active-host selection; version 1 migrates without inventing a paired host. Native clients persist that value with `expo-sqlite/kv-store`; per-session reading checkpoints use the same local database but a separate versioned key. A checkpoint stores a semantic timeline item plus its relative reading offset, so streamed content and layout changes do not invalidate the reader's place. Unknown schema versions or invalid payloads fall back to current defaults instead of being interpreted as valid settings.

The web client uses the same storage interface backed by `localStorage`. `expo-sqlite` web support is still alpha and requires a WebAssembly Metro setup plus cross-origin isolation headers. Those headers can constrain embedded preview/browser behavior, so VibePad does not impose that tradeoff merely to persist a small preference payload.

Preferences are distinct from secrets and from the host's provider-event journal. The native host-credential boundary uses Expo SecureStore and accepts only storage-safe host identifiers plus validated Basic or bearer credential shapes. Web keeps bearer credentials in memory and never writes them into browser storage. Add Host opens the pairing form, and selecting another saved profile remounts host-scoped client state so sessions from different hosts cannot leak through a stale singleton.

The host creates an eight-character, one-use `XXXX-XXXX` pairing code with a ten-minute lifetime at startup. VibePad adopts the human-readable `user_code` convention from OAuth device flow while retaining its local host-pairing protocol. A source address receives five failed redemption attempts during the code window before the host returns HTTP 429 with a retry interval. Redeeming the code returns a device token once; the host stores only its SHA-256 hash in a dedicated SQLite authorization database, while host metadata remains in preferences and the native token remains in SecureStore. Pairing also persists a random app installation UUID plus app, client, device-model, platform, and OS metadata in a separate relational table. This evidence supports Voice training provenance but is never accepted as authentication. Remote HTTP and streaming requests require the bearer token. Voice WebSockets carry it through a negotiated subprotocol rather than a URL, preventing credentials from entering query logs. Revocation marks the device row immediately and removes the local profile and credential. Repeated authenticated polling updates device presence at most once per minute, and SQLite waits for short legitimate writer overlap so browser refreshes cannot starve the separate pairing CLI. Loopback command-line access without a browser origin remains available for development, while loopback browser requests still require pairing so an arbitrary webpage cannot use permissive local CORS as an authorization bypass.

## Host reachability and bootstrap

The default private path is a direct tailnet connection. VibePad Host binds port 4100 to the machine's Tailscale address, and clients use its MagicDNS name such as `http://hochi:4100`. Tailscale supplies the encrypted private network and tailnet policy; the VibePad device token remains the application authorization layer. Ordinary VibePad traffic goes straight to the host and port. Tailscale Serve remains available to unrelated services, while SSH serves bootstrap and recovery. Loopback remains available for same-host development.

The repository-local host installer discovers the current Tailscale IPv4 address and short MagicDNS name, rejects an accidental public bind, detects Codex and OpenCode executables, and writes a user-owned service. Linux uses a systemd user unit and macOS uses a LaunchAgent. Both source a mode-`0600` host environment whose installer-owned fields can be refreshed without replacing operator-managed credentials. Install and restart operations wait for the HTTP health endpoint; status reports process and endpoint health separately. The service binds to Tailscale directly, so installing VibePad does not create a Tailscale Serve route.

The iOS client declares local-network access deliberately and uses the unqualified MagicDNS machine name rather than a public `.ts.net` URL. The physical-device gate must prove HTTP, NDJSON streaming, and Voice WebSocket behavior through the tailnet. Binding to `0.0.0.0` is an explicit fallback rather than the default because it also exposes VibePad on unrelated interfaces.

SSH belongs to bootstrap and recovery. A blank Mac flow reaches the machine once, installs Bun and VibePad Host, detects and optionally installs supported harnesses, performs provider-owned login, installs a LaunchAgent, discovers the Tailscale address, starts the host, and presents its URL plus pairing code. The archived Swift implementation supplies the behavioral reference for installed, start, connect, offline, and recovery states; the Expo rewrite reproduces that contract in TypeScript.

The public bootstrap installs a checksum-verified, versioned Host executable, then asks for consent before installing the selected isolated toolchain. It verifies provider-owned authentication, installs Agent Browser plus the dedicated Kasm browser runtime, and installs the host user service. The browser option requires a running Docker engine and Compose plugin. Linux x64 release installation is live-proven without a checkout. The same release script builds Linux arm64 and a universal macOS app; Developer ID signing, notarization, and clean macOS acceptance remain the macOS distribution gate.

## Canonical versus provider-specific behavior

Canonical concepts are earned by working implementations. OpenCode is the first reference provider. A concept enters the shared protocol only when it is needed by VibePad as a product concept and can retain its meaning across providers.

The first shared concepts are host, project, session, turn, timeline item, model, permission, question, file change, connection state, and capability. Each event also retains its provider-native payload for lossless rendering and forward compatibility.

Capabilities answer whether a connected adapter supports an operation and, when useful, describe constraints or a provider-owned control surface. The UI must not infer support from provider names.

## First vertical slice

The first slice connected the client to one host and one real OpenCode server, listed projects and sessions, resumed or created a session, streamed its timeline, and handled real interactive requests. Codex is now the second live provider behind that same host and client contract. It challenged identity, generated-protocol ownership, reasoning variants, collaboration modes, app-server server requests, and multi-provider health without making those details universal by name.

## Workspace shell

The durable navigation hierarchy is host, workspace, then session:

- The sidebar is the inventory. A workspace row shows the folder on the left, its host on the right, and expands to reveal durable sessions.
- Selecting a session in the sidebar makes it the active work context. One context contains its chat, preview, file, diff, inspector, layout, and reading state.
- Chat remains the primary surface while Files, Changes, and Preview open in a session-local workbench. The workbench can split beside chat, expand to the available canvas, or replace chat at narrow widths while retaining both surfaces' state.
- Idle, working, retrying, permission-needed, and question-needed are explicit provider-derived session states. Offline belongs to the host/workspace boundary. Unread is local viewing state; it must not be conflated with a provider interaction. VibePad does not invent a generic blocked state when a provider has not supplied a concrete reason.

This keeps durable history, discovery, and selection in one place. File tabs and browser-target tabs remain local to the selected session because they are additive resources inside that work context rather than global navigation.

The visual implementation uses VibePad-owned RNR components. OpenCode is the reference for provider behavior and timeline semantics; Codex is the reference for the workspace-oriented information architecture. Neither upstream UI owns VibePad's product contract.

The header uses OpenCode's stacked status glyph as the actionable host and service-status control instead of representing connection state with a green dot alone. A small badge may communicate healthy, degraded, disconnected, or attention-needed state, but the glyph remains stable and opens the status surface. Host reachability, provider health, and ancillary MCP or language service health remain distinct values inside that surface.

The shell header has four jobs and does not repeat the main canvas:

- The sidebar toggle controls the durable session inventory.
- The fading title and project context identify the selected session without creating a second session bar.
- Chat, Files, Changes, and Preview switch the selected session's workbench.
- The host and service controls expose reachability plus provider, MCP, LSP, and plugin state.

New Chat lives at the top of the sidebar and first asks for a discovered workspace; each project row also exposes a direct new-session action. Adding or cloning a project is a separate host action. Rename and archive live in the session action menu. A conversation begins with its timeline, and an empty conversation remains visually empty.

OpenCode archive is deliberately one-way in the current adapter. The provider sets an archive timestamp but does not expose a supported operation to clear it, so the UI removes the session from active inventory and offers no misleading Undo. Reversible archive can be added provider by provider when it is real.

The selected session exposes compact workbench launchers in the main header. Chat closes the workbench; Files, Changes, and Preview open or retarget it. Workbench controls are session-local, so selecting another sidebar session restores that session's surface, expanded state, split ratio, open files, browser targets, review draft, and timeline checkpoint.

Files uses a landscape inventory/content split inside the right workbench. An ordinary file tap replaces the selected file, while long-press retains another file as an additive tab. The file list also aggregates additions and deletions from structured VCS data at both file and folder level. Changes uses the same split for changed-file inventory and a virtualized patch. Files and Changes open expanded by default because their own inventory/content split needs the canvas; Restore Split remains available when chat context is useful. Preview opens beside chat by default so captures can land directly in the existing composer. Workbench surfaces remain mounted while hidden, so selected files, open file tabs, selected diffs, and live preview feedback survive retargeting the workbench or returning to Chat.

The OpenCode implementation uses the generated v2 `file.list`, `file.read`, and `vcs.diff` operations. VibePad projects their results into a small provider-neutral read/list/change contract and does not reproduce OpenCode transport or parse `git` command output. Search, write/apply, branch comparison, and binary preview remain separate capabilities rather than being implied by this first read-only slice.

## Icon system

VibePad uses React Native Nano Icons through a small RNR-compatible wrapper. The source SVGs remain inspectable and are compiled into typed font families:

- `VibePadUI` contains the deliberately small product glyph set used by the universal shell;
- `VibePadProviders` contains the provider marks vendored from OpenCode so model and provider identity does not depend on a remote asset service.

The generated fonts and glyph maps are loaded by the universal Expo root. A component asks for a typed icon name, size, color, and accessibility behavior; feature code does not import arbitrary SVG implementations or couple itself to the generator. The upstream OpenCode assets are source material, while the generated family names and wrapper are VibePad-owned contracts.

Harness identity is explicit protocol data and remains separate from model provider identity. `HarnessIcon` maps OpenCode, Codex, and Claude Code to semantic glyphs for session rows and assistant messages. Model selectors continue to use the provider family, so a Codex session using an OpenAI model and an OpenCode session using the same model remain distinguishable.

## Timeline transport and rendering

Provider SDK or app-server messages do not go directly into React components. Each adapter projects stable product concepts into `TimelineItem` and `TimelinePart`, retains the complete provider-native value on every item, and marks unmapped synthetic or system material as provider detail rather than discarding it. The client first loads a bounded snapshot, then consumes ordered session events and refreshes that projection while a turn is running.

This keeps three concerns independent:

1. generated OpenCode v2 and Codex app-server bindings own their native types, while their adapters own their distinct transports;
1. the VibePad protocol owns stable message, reasoning, tool, attachment, shell, notice, visibility, and lifecycle semantics;
1. the Expo renderer owns native layout, motion, selection, and accessibility.

The AI SDK and AI Elements are useful references for streaming state and item composition, but they do not wrap or replace the OpenCode transport. Vercel's Streamdown is DOM-oriented. The native candidate is `react-native-streamdown`, which requires a development build because its enriched Markdown renderer is native. Until the project intentionally crosses that build boundary, the Expo Go slice renders complete native text and reasoning without truncation. The Markdown renderer should later be introduced behind platform-specific message-content components, not spread through the timeline contract.

## Component parity and React Native translation

Base UI, shadcn/ui, and OpenCode are behavioral references. For example, the VibePad sidebar keeps shadcn's useful composition boundaries: provider, trigger, header, scrollable content, groups, menu items, item actions, badges, inset, and an adaptive mobile sheet. VibePad implements those boundaries with React Native components and product-specific state rather than importing the web sidebar.

React Native Reusables supplies source-owned building blocks such as button, text, collapsible, popover, dropdown menu, tooltip, dialog, and portal. It does not currently provide the complete VibePad sidebar composition, so that thin composition belongs to `packages/ui`. We retain parity with the upstream behavior and accessibility model while allowing touch targets, gestures, breakpoints, and motion to follow native conventions.

Product code is organized by feature. Shared primitives remain under `components/ui`; workspace, composer, files, changes, preview, and harness components live beside their owning feature. A feature may customize a shared primitive in its own `components` directory without hiding that duplication in a page or router file. Expo Router files remain thin route boundaries.

Most application code is ordinary TypeScript and React: hooks, stores, queries, schemas, provider events, and component state are shared. Universal rendering uses `View`, `Text`, `Pressable`, `ScrollView`, and other React Native primitives instead of DOM elements. NativeWind covers supported styling; Reanimated covers motion. Platform files are reserved for real differences, such as a browser iframe on web versus WebView on native. Native modules are needed only for capabilities Expo does not expose, not for the workspace shell or provider protocol.

## Preview boundary

Preview has two host-owned resources with different lifecycles:

- VibePad Browser is a persistent shared Chrome surface with real browser targets and login state;
- a project preview is an ordinary dev server with readiness, logs, ownership, and explicit stop behavior.

The first shared browser path is implemented. Host bootstrap creates a dedicated Docker Compose project named `vibepad-browser` with a pinned Kasm Chrome image, its own Chrome profile, disposable cache, downloads, runtime journal, and lifetime process lock. Its CDP and KasmVNC endpoints bind only to loopback on ports 19223 and 16901 by default. These containers, paths, ports, and credentials are independent from a developer's personal Kasm installation. This is the visible single-profile baseline, not the final multi-agent allocation model.

The host browser broker keeps raw CDP and KasmVNC private. Paired clients use authenticated request-response operations to list, create, activate, navigate, reload, and close page targets. A ten-minute, path-bound view session proxies the exact Kasm surface and WebSocket through the paired host. Web renders that tokenized surface in an iframe; iOS and Android use an Expo-compatible WebView. The client normalizes target IDs and entities in one host-scoped Legend store, while selections, drawings, notes, and review timing remain session-scoped. Browser pages therefore do not become top-level harness-session tabs.

The iframe or WebView renders KasmVNC, not a second navigation context. Human input and Agent Browser/CDP therefore operate the same Chrome target and profile. Cookie, local-storage, and tab restoration have been exercised through a full browser stop/start. The target journal restores only HTTP and HTTPS pages and never treats cache as durable state. The live surface requests remote resize so the browser reflows to the available Preview pane; mobile, tablet, and desktop page emulation remain separate CDP controls. The dedicated visible Chrome runs in plain kiosk mode so VibePad owns the tabs and navigation bar. A live two-target experiment retained the page-only presentation; Chrome app mode was rejected because creating the second CDP target restored Chrome's own tabs and address bar. Profile selection, explicit clear/isolate operations, download handling, and login/history acceptance remain product work.

Parallel agent browsing must not mount or write one live Chrome profile from multiple processes. The intended next control-plane boundary is a session-owned browser lease. Headless work uses isolated Browserless workers with one tracking identity per harness session, bounded concurrency, and timeout cleanup. Authenticated workers may receive a point-in-time encrypted snapshot from one canonical visible Kasm login station, but worker state never merges back into that profile. Kasm remains the user-visible handoff for login, CAPTCHA, 2FA, and consequential confirmation. Browser activity events may reveal a passive mini-live Preview automatically; foreground takeover is an explicit typed request associated with the owning harness session.

Closing a browser tab closes only that page target. It never archives the harness session or implicitly stops a dev server, browser profile, host process, or Kasm stack. Browser shutdown is an explicit host operation. A host restart preserves the independent browser containers and profile; the client renews its short-lived view session after reconnecting.

The runtime writes a VibePad-specific Agent Browser configuration pointing at the private CDP endpoint and exposes its path to the installed host service. Independently launched harnesses are not silently hijacked. Provider-by-provider proof that every VibePad-launched harness discovers and prefers this tool remains an acceptance gate.

Direct Tailscale reachability is the default private path for host-owned previews. A local URL remains useful on the host, and an externally managed tunnel can satisfy the same client contract when a machine is outside the tailnet. Apple Simulator surfaces supplied by Argent Lens or ServeSim can enter through the later project-preview contract without changing browser-profile ownership.

The first review surface has Browse, Select, and Draw modes. Draw stores normalized vector points, pointer identity, pressure when available, viewport dimensions, URL, and an offset from the review clock. Select records a normalized point. The shared Kasm surface currently retains an honest coordinate-only selection because the rendered pixels are remote; DOM anchoring requires broker-side CDP hit testing against that exact target. The direct fixture renderer already proves the richer selector, bounds, text, role, accessibility label, component/test identifier, and source-hint shape, but that evidence is not attributed to the Kasm broker until the CDP path exists. Cues remain structured instead of being flattened into a screenshot.

The current feedback bundle combines selections, strokes, cue-relative timing, and an editable note and has been delivered to a real OpenCode session. Each review cue follows the Base UI attachment anatomy with a thumbnail, title, compact description, open target, and remove action. In split view these attachments belong to the existing chat composer; Preview does not create a second draft or composer. When Preview is expanded and chat is hidden, the same draft appears as a floating bottom tray with Cancel and Send controls. Detailed URL, viewport, DOM-anchor, vector, and timestamp data belongs in a deliberate review detail surface rather than a persistent preview HUD. Real raster screenshot capture, microphone audio, and STT transcript alignment are still separate work. Simulator gestures validate the interaction path but cannot prove physical Apple Pencil pressure; that requires an iPad hardware pass.

Voice is three product surfaces, not one overloaded mode:

1. dictation produces editable composer or review text;
1. spoken notifications summarize important state without reading the full chat response;
1. a global conversational orchestrator can inspect and operate typed session and coordination controls across projects.

The first hardware flow is an explicit review button followed by talking while selecting elements and/or drawing, then Send. Hold-to-talk/drag and voice-command Send are later interactions built on the same timestamped capture model.

Ordinary composer dictation uses Expo Audio's foreground PCM stream at the client boundary. Audio is normalized to 16 kHz mono signed linear16 and sent to the host, which authenticates a WebSocket to Voice Lab's `elevenlabs-scribe_v2` realtime route. A shared host credential service mints, caches, and refreshes a least-privilege Voice child token for each paired installation and attaches the recorded Peacockery client metadata to HTTP and realtime requests. The parent minting key and child tokens are never bundled into Expo. Stop returns the committed transcript to the saved composer selection; the adjacent Send action requests the same transcription and sends the resulting draft. Interim text is retained by the controller but hidden by default so dictation does not cover the conversation. Browser capture is a separate adapter behind the same controller; iPad uses Expo's native `AudioStream`.

## Coordination boundary

VibePad's host and provider adapters own sessions launched through the product. Agent-bus supplies cross-harness peer discovery, lifecycle messages, safe-point pause/resume requests, handoffs, and resource leases. Together they form the control plane needed by the product; ACPX is not required as the foundation and must not silently intercept every ordinary Codex, Claude Code, or OpenCode launch. It may remain an optional compatibility adapter for externally managed persistent ACP sessions when that interoperability earns a concrete journey.

## UI verification

Argent and Maestro are complementary:

- Argent drives exploratory development: launch, inspect, tap, screenshot, debug, profile, and report what the agent actually sees.
- Maestro owns readable, deterministic flows that defend completed behavior.

Every UI slice is run before it is marked complete. Milestones require a reviewable screenshot or recording, and important controls receive stable accessibility identifiers for Maestro rather than coordinate-only tests.
