# VibePad Native iPad Client PRD

> Canonical product direction. This document defines VibePad's native iPad product and the
> TestFlight-sized cuts used to deliver it.

## 1. Product position

VibePad is an iPad-first native client for controlling OpenCode sessions on a remote Mac/Linux host.

The app is not a local coding environment and does not run OpenCode on the iPad. It is a native control surface for an already-running `opencode serve` or `opencode web` backend, with iPad-specific interaction added on top: split-view project control, live preview, Apple Pencil annotation, voice steering, and SSH/tunnel setup.

The base repo already provides the core OpenCode client layer:

- REST API client for OpenCode sessions, files, messages, diffs, permissions, questions, agents, models, and projects.
- SSE client for live server events.
- Native chat UI with streaming, tool cards, reasoning, permissions, questions, image attachments, and voice composer.
- File tree and file preview.
- Host profiles and SSH tunnel support.
- Markdown files with native rendered and raw-source modes.

VibePad focuses on the missing iPad-native workflow.

## 1.1 API-first design rule

Most VibePad behavior should be driven by APIs and capabilities that already exist, not by vague product defaults.

For every workflow, the product must identify:

- the upstream API or SDK surface
- what can be automated
- what requires a host helper
- what is only a UI convention
- what has to be agent instruction/context

If a feature cannot be tied to an API surface, it should not be treated as a real implementation plan yet.

## 1.2 Locked product loop

VibePad becomes a complete product when these four connected loops work on a real iPad:

1. A polished SwiftCN-owned workspace controls a real OpenCode host, project, and session.
2. Preview starts the project's dev command and opens the reachable live result automatically.
3. Apple Pencil markup is composed with the current preview and sent to the active session.
4. A two-finger voice gesture can describe and submit the current file or preview context with chat hidden.

Each loop ships as a coherent TestFlight cut. Full code editing/LSP, remote Simulator streaming,
DOM-level annotations, and browser automation are later extensions, not prerequisites for this loop.

## 2. Core user goal

The user should be able to sit with an iPad and work against code on `gmk-server` or another host:

1. Open an existing project.
2. See sessions, chat, tool calls, diffs, and files.
3. Start or open a project preview.
4. Resize, hide, or fullscreen the preview.
5. Use voice to steer OpenCode without typing.
6. Draw on the preview with Apple Pencil and send that markup as context.
7. Use SSH/tunnel profiles without repeatedly retyping credentials.

## 3. Non-goals

- Do not implement a full code editor in v1.
- Do not run OpenCode locally on iPad.
- Do not overlay arbitrary third-party iPad apps.
- Do not depend on Expo Go or Safari being side-by-side.
- Do not require App Store distribution for personal use.

## 4. Existing foundation

### 4.1 Voice runtime

The current app has an Apple Speech-backed session seam and SwiftCN audio/visual components. This is
enough for Cut 1 composer validation, but it is not the final Cut 4 engine.

VibePad decision:

- Keep transcription behind a small engine/session boundary.
- Reuse TimberVox's FluidVoice integration when Cut 4 begins.
- Preserve the native waveform, transcript, retry, and send/cancel state model.
- Keep provider-specific credentials and transport out of views.

### 4.2 Citadel SSH tunnel

The current app uses Citadel `0.12.1`, a Swift SSH client library built on SwiftNIO SSH.

Current behavior:

- The app generates an Ed25519 keypair on device.
- The public key is shown in Settings so it can be added to the SSH gateway/server.
- SSH host key trust uses TOFU: trust on first use, detect later mismatch.
- A local listener binds to `127.0.0.1:4096` on the iPad.
- Each local TCP connection is forwarded through SSH using a `direct-tcpip` channel to `127.0.0.1:<remotePort>` on the SSH side.
- OpenCode then looks like `http://127.0.0.1:4096` from inside the app.

VibePad decision:

- Keep Citadel and host profiles.
- Add clearer GMK/server-specific setup text.
- Add a saved host profile for common VibePad routes.
- Do not store SSH passwords in v1; use generated public key auth.
- Store OpenCode Basic Auth password in Keychain as the base app already does.

### 4.3 OpenCode API

The app already consumes the OpenCode REST/SSE API.

Known useful surfaces:

- sessions: create, list, select, delete, fork, revert
- messages: list, send async prompt, send attachments
- events: global SSE stream
- files: tree, content, status, search
- diffs: session and VCS diff
- permissions/questions: show and respond
- shell/command: run commands through OpenCode when needed
- projects: list/current project

VibePad should not drive OpenCode through terminal scraping. If OpenCode exposes the needed behavior, use the API directly.

## 5. Primary iPad layout

VibePad uses one explicit execution hierarchy:

```text
Host -> Project/worktree -> OpenCode session -> Workbench surface
```

Hosts, projects, sessions, and files are not four equal navigation buckets. The selected host and
project define the scope. The sidebar then shows that project's sessions and files. The selected
session owns the active chat and preserves the workbench state used while working in that session.

The Cut 1 iPad workspace is composed from these regions:

```text
+--------------------------------------------------------------------------------+
| GMK Server / Project | OpenCode session tabs                  | + | Preview | Orb |
+------+--------------------------------------------------------+------------------+
|      |                                                        |                  |
| Proj |                    Main workbench                      | Utility drawer   |
| rail |                                                        | default: right   |
|      | chat / file / diff / live preview                     |                  |
|      |                                                        |                  |
+------+--------------------------------------------------------+------------------+
| Contextual rail: current surface status and surface-specific actions            |
+--------------------------------------------------------------------------------+
```

The far-left project rail is deliberately narrow. It shows recent projects as icons, adds/opens a
project, and provides host/settings access without consuming a full navigation column. The utility
drawer is the only full-width side panel:

- When Chat is the main workbench surface, the drawer shows project navigation: Sessions, Files,
  Changes, and Search.
- When File, Diff, or Preview is the main surface, the drawer can show Chat so the user can work and
  steer OpenCode side by side.
- The drawer can be collapsed, overlaid, or pinned. Its preferred dock side is configurable; Simon's
  initial TestFlight defaults it to the right.
- Fullscreen Preview and Fullscreen Chat hide both the project rail and utility drawer, leaving only
  a small restore/voice affordance.

Required panel modes:

- `Chat + Files`: no preview, larger chat.
- `Chat + Preview`: file tree collapsed.
- `Workbench + Utility`: the default iPad mode; the drawer content follows the focused surface.
- `Fullscreen Preview`: preview and Pencil overlay take almost all space.
- `Fullscreen Chat`: preview hidden, chat dominates.

Preview panel should be open/closeable with one obvious button.

### 5.1 Session tabs

The primary top tab strip represents active OpenCode sessions:

- Selecting a session in the sidebar opens or focuses its tab.
- `+` creates a new OpenCode session in the currently selected project/worktree.
- Closing a tab closes only the local presentation; it does not delete the OpenCode session.
- Reopening a session restores or recreates its local workbench presentation.
- Switching host or project shows that scope's active tabs and never silently mixes directories.
- Each session tab preserves its focused surface, open document, preview presentation, panel sizes,
  and chat mode.

Open files and previews are workbench surfaces inside the current session. A document tab strip may
be shown inside a code-focused workbench, but document tabs are not OpenCode sessions and do not
appear in the primary session strip.

Cut 1 does not add a second permanent document-tab strip. Opening a file replaces the focused
workbench surface while preserving the session tab; recent/open files remain available in the
utility drawer. A document-tab strip can be added later if real iPad use proves it valuable.

### 5.2 Always-visible project context

In VibePad, "project context" means the execution scope for OpenCode requests:

- connected host/profile
- selected remote directory or worktree
- current session

It does not mean the language model's token/context window. VibePad should show a compact context strip in every primary layout so the user can tell which machine and directory an action will affect before sending a prompt or approving a tool.

Changing the host or directory is a real state transition. The app must clear stale selection where necessary and reload sessions, files, diffs, agents/models, commands, MCP state, and preview state using the new scope. A session opened from a different directory must either switch the visible context explicitly or show a clear mismatch, never silently mix data from two directories.

### 5.3 UI ownership

The visible workspace shell is owned by VibePad and composed from reviewed SwiftCN primitives. It
does not use `NavigationSplitView`, system toolbar placement, or a stock `TabView` as its architecture.
Raw SwiftUI remains the rendering/layout language, and stock controls may be used inside leaf
content when useful, but host/project context, sidebar, session tabs, headers, resizable regions,
chat presentation, preview rail, and overlays use explicit VibePad/SwiftCN components and state.

### 5.4 Project, workspace, and tab terminology

The user-facing noun in Cut 1 is **Project**: a directory/worktree on the selected OpenCode host.
There is no separate VibePad "workspace" object in onboarding or primary navigation.

`WorkspaceStore` is an internal Swift state coordinator only. It owns selected host/project/session,
open session tabs, focused workbench surface, utility-drawer content and placement, panel sizes, and
restoration. It does not represent a new OpenCode server resource.

OpenCode's experimental workspace API remains out of the Cut 1 information architecture. If it later
provides a concrete worktree/control-plane capability VibePad needs, it can be surfaced under a
Project without changing the session-tab model.

### 5.5 Empty and project-home states

Before a project is selected, the workbench shows a quiet project home rather than an empty
three-pane shell. It contains recent projects, `Open Project`, and connection status. Selecting a
project restores its session tabs or shows recent sessions with one primary `New Session` action.
This follows the clarity of OpenCode's project landing experience without copying its desktop layout
pixel for pixel.

## 6. Files and chat

VibePad should preserve existing file and chat functionality:

- file tree
- file content preview
- markdown preview
- image preview
- session list
- chat messages
- streaming assistant text
- reasoning cards
- tool cards
- patch/diff cards
- permission cards
- question cards
- voice composer

VibePad changes:

- Make file tree and chat layout more iPad-specific.
- Add a direct "open in preview context" path from tool/file cards.
- Keep file editing out of v1 unless it falls out naturally from existing APIs.

## 7. Live preview

The removed Markdown WKWebView was unrelated to project preview. Live Preview is a new workbench
surface that displays a running project URL.

### 7.1 Preview types

VibePad should support at least these preview types:

- `Web`: normal web app URL.
- `Expo Web`: Expo web preview URL.
- `Expo Mobile Shape`: same web preview framed as iPhone-sized viewport.
- `Cloudflare Worker`: local or tunnel URL.
- `Attached URL`: diagnostic/fallback attachment to an already-running reachable URL.

### 7.2 Preview display modes

For Expo/mobile-oriented work:

- show an iPhone-frame preview mode by default
- allow rotation portrait/landscape
- allow zoom fit/fill

For normal web/Cloudflare work:

- show full-width responsive preview
- allow desktop/tablet/mobile viewport presets

### 7.3 Preview lifecycle

Preview is an action, not a URL-entry workflow. Pressing Preview must:

1. Resolve the selected project's saved preview profile.
2. Start or reuse its host-side dev process.
3. Wait for a structured readiness signal or health check.
4. Start or reuse the configured reachability layer when the URL is not directly reachable.
5. Return the live URL and process status to the app.
6. Open or focus the WKWebView surface.

The preview profile stores the command, working directory, environment, readiness rule, local
port/URL rule, reachability strategy, viewport, and process ownership policy. First-run detection may
offer likely commands from known project files, but ambiguity is resolved once by the user and then
persisted. A typed URL remains available only as a diagnostic fallback.

VibePad uses a host-side preview manager for deterministic start/status/log/restart/stop behavior.
OpenCode can call the same manager through an agent tool later, but pressing Preview in the app does
not depend on prompting an agent or scraping a terminal.

Cloudflare Tunnel or Tailscale provides reachability when needed; it does not own dev-process
discovery or lifecycle. The active preview URL must be reachable from the iPad but does not inherently
have to be public.

#### Preview discovery order

The host preview manager uses the same layered approach proven by WebContainers, Codespaces, and
remote IDEs:

1. Reuse an already-running healthy preview owned by the project profile.
2. Use an explicit saved command/port/readiness rule when present.
3. On first use, inspect recognized project files and offer likely dev commands for one-time
   confirmation; never silently choose between multiple plausible destructive commands.
4. Start the selected command as a managed process and parse stdout/stderr for `localhost` URLs.
5. Observe newly listening ports belonging to the managed process tree.
6. Health-probe candidates, prefer the explicit emitted URL, and ask once if multiple healthy
   candidates remain.
7. Persist the successful command and detection rule so subsequent Preview presses are one action.
8. Establish the configured Tailscale/Cloudflare route and return a structured preview status/URL.

This is automatic after the first unambiguous detection or confirmation. Manual URL entry is not the
normal product path.

### 7.4 WKWebView API inventory

Relevant native surfaces:

- `WKWebView` embeds web content directly in the native iPad UI.
- `WKWebViewConfiguration` controls data store, JavaScript, preferences, and message handlers.
- `WKScriptMessageHandler` allows JavaScript-to-native bridge messages.
- `WKNavigationDelegate` / `WKUIDelegate` allow navigation control and popup/window handling.
- iOS 16+ WKWebView supports web content using JavaScript fullscreen APIs for page elements.
- VibePad can still do native fullscreen independent of web fullscreen by resizing the SwiftUI panel to full app width/height.

VibePad implication:

- Fullscreen preview should be native panel state first, not dependent on the website calling browser fullscreen.
- Web fullscreen support is useful for video/canvas content but should not be the core preview layout mechanism.
- Preview sizing presets are native layout wrappers around the web view, not something Expo or Cloudflare has to own.

### 7.5 Expo API inventory

Expo exposes enough dev-server surface to make this workable without terminal scraping.

Known surfaces:

- `npx expo start` starts a Metro dev server, defaulting to `http://localhost:8081`.
- Expo CLI shows a QR code for the dev-server URL.
- Default serving mode is LAN.
- `--localhost` forces localhost.
- `--port` selects the dev-server port.
- `--tunnel` uses a public tunnel URL, currently through ngrok.
- `npx expo start --web` starts browser/web development.
- The dev server exposes `/_expo/open`.
- `GET /_expo/open` is a dry-run endpoint returning deep links as JSON.
- `POST /_expo/open` triggers the same local action as Terminal UI open commands, subject to same-origin restrictions.
- Query params include `platform=ios|android|web` and runtime selection for Expo Go vs custom development client.
- `EXPO_PACKAGER_PROXY_URL` can force the URL Expo opens apps to.

VibePad implication:

- For Expo web preview, use `npx expo start --web` and load the web URL in `WKWebView`.
- For Expo native-device preview, VibePad can discover deep links from `/_expo/open`, but opening Expo Go or a dev client is a separate app handoff, not an embedded WKWebView preview.
- For iPad-contained visual review, the most reliable path is Expo Web in a mobile-shaped viewport.
- For true native Expo app preview, VibePad can provide an "Open in Expo Go / Dev Client" button using the discovered deep link, but the app cannot embed Expo Go inside VibePad.
- `EXPO_PACKAGER_PROXY_URL` may let a host helper publish stable Cloudflare/Tailscale URLs for Expo dev-client use.

### 7.6 Cloudflare API inventory

Relevant Cloudflare surfaces:

- `cloudflared tunnel login`
- `cloudflared tunnel create <NAME>`
- `cloudflared tunnel route dns`
- `cloudflared tunnel --config <config.yml> run <NAME>`
- `cloudflared tunnel list/info/cleanup/delete`
- local tunnel config maps hostnames to local services
- Cloudflare API can create/manage remote tunnels and retrieve tunnel tokens
- Wrangler is the Worker CLI and supports Worker development/deployment flows
- Worker preview URLs can be generated for deployed Worker versions
- Wrangler exposes programmatic utilities for local Worker tooling and remote bindings

VibePad implication:

- The iPad app should not directly manage Cloudflare account credentials in v1.
- A host-side VibePad helper should own Cloudflare tunnel setup/teardown.
- Project instructions/skills should tell agents when to use the Cloudflare helper rather than raw ad hoc commands.
- Default session behavior should be "bring preview up for this session, tear it down when done" unless user pins it.
- Cloudflare Worker deployed preview URLs are different from local dev preview URLs. Local dev preview still needs `wrangler dev` plus either direct LAN/SSH/tunnel access or Cloudflare tunnel.

### 7.7 Preview control model

VibePad should expose these preview controls:

- open/close preview
- reload preview
- back/forward
- copy current preview URL
- switch viewport: responsive, iPad, iPhone portrait, iPhone landscape, desktop
- fullscreen preview
- split ratios: 25/50/75 or drag-resizable
- open externally in Safari
- for Expo native: open deep link in Expo Go/dev client
- for host helper: start/stop/restart preview command

These are VibePad UI controls over native `WKWebView` and host orchestration APIs, not "Expo controls."

## 8. Apple Pencil annotation

Pencil support is the main native advantage over a PWA.

### 8.1 Required behavior

When preview is visible, user can enable markup mode:

- draw with Apple Pencil over preview
- circle/arrow/box/X things
- clear annotation
- undo last stroke
- send markup to chat with a text prompt

### 8.2 Implementation

Use PencilKit:

- `PKCanvasView` overlay above the preview
- transparent background
- drawing policy optimized for Pencil
- optional finger drawing disabled, so fingers remain navigation/gesture input

When sending annotation:

- capture preview screenshot if available
- capture PencilKit drawing image
- capture normalized bounding boxes/stroke data where practical
- send as image attachment plus generated text context

Example generated message:

```text
Look at the marked area in the preview. The red X indicates the element to remove.
The screenshot/annotation is attached.
```

### 8.3 PencilKit API inventory

PencilKit gives more than a bitmap.

Available surfaces:

- `PKCanvasView` captures Apple Pencil/finger drawing.
- `PKDrawing` stores the drawing.
- `PKDrawing.image(from:scale:)` renders drawing content to an image.
- `PKDrawing` contains strokes.
- `PKStroke` exposes stroke-level data.
- `PKStrokePath` and stroke points expose path geometry, timing, force, altitude, azimuth, size, opacity, and related drawing attributes.
- Stroke `renderBounds` gives the rendered bounding box.
- Existing APIs allow inspecting, modifying, constructing, and rendering PencilKit drawings.

Newer/future surface:

- Apple announced `PKStrokeRecognizer` in WWDC26 for iOS/iPadOS/macOS/visionOS 27. It supports on-device handwriting recognition, indexable content, and search against handwritten strokes.

VibePad implication:

- Baseline annotation can send an annotated screenshot and the raw PencilKit drawing/stroke metadata.
- The agent can usually infer "X means remove", circle means focus/this area, arrow means move/look here from the annotated image plus user speech.
- We do not need a local shape classifier to make the workflow useful.
- If text is handwritten on the preview, iOS 27 `PKStrokeRecognizer` can be used to convert handwriting to text before sending context.
- For iOS 17/18/26 baseline, use drawing image + stroke bounds + user transcript as context.
- If we later want deterministic gestures, simple geometric heuristics can classify common shapes from stroke paths: X, circle, box, arrow, underline. That is VibePad logic, not a required Apple API.

### 8.4 Annotation-to-agent context

When the user draws and speaks, VibePad should send a structured prompt payload:

```text
User speech:
<transcript>

Preview URL:
<url>

Annotation summary:
- attached screenshot with Pencil markup
- drawing bounds: <normalized rects>
- detected ink/text if available

Instruction:
Use the attached visual context. Treat X marks as likely remove/delete, circles/boxes as focus targets, arrows as direction/movement hints, and handwritten text as user instruction when recognizable.
```

This should be project/session-level instruction, not a global hidden magic behavior. The user should be able to override the meaning in speech.

## 9. Voice interaction

The existing app already has a mic button, voice rail, waveform, transcription states, and realtime speech session lifecycle.

VibePad adds a gesture-first voice mode:

- two-finger hold anywhere in the safe voice zone starts recording
- release stops recording
- swipe right before release submits
- swipe left/down cancels
- mic button remains as fallback

The speech animation should feel like an active voice rail:

- waveform while recording
- "transcribing" state after release
- "ready to send" state when transcript lands
- error/retry state when transcription fails

The existing `VoiceRailWaveformView` is a good starting point. We do not need to find or copy another open-source animation unless the current one feels bad in use.

### 9.1 Gesture API inventory

Native iOS supports the interaction directly.

Available surfaces:

- SwiftUI supports gesture composition with simultaneous/sequence/exclusive gestures.
- SwiftUI gesture composition is the default implementation path. A lower-level recognizer is added
  only if real-device evidence proves SwiftUI cannot reliably represent the interaction.

VibePad implication:

- Implement the two-finger voice gesture as a VibePad/SwiftUI workspace interaction.
- Restrict it to a safe region or mode so it does not fight with PencilKit, WKWebView scrolling, text selection, or split-view resizing.
- Use Pencil input for annotation and two-finger touch for voice. Do not treat Pencil as one of the two voice fingers.
- Keep the mic button as fallback for cases where system gestures or web content conflict.

### 9.2 Voice animation inventory

Current repo already has:

- `VoiceRailWaveformView`
- microphone audio level stream
- recording/transcribing/retry/error states
- preserved audio retry

External ecosystem:

- React Native Skia can build the kind of voice-wave/gesture animation seen in the Jaytel demo, and Shopify documents Skia gesture integrations.
- That stack is relevant if building a React Native app, but VibePad is native SwiftUI/PencilKit. Recreating the animation in SwiftUI Canvas or Core Animation is more direct than importing a React Native/Skia stack.

VibePad implication:

- Treat the Jaytel voice animation as design inspiration, not a dependency.
- Start from the existing voice rail and replace visuals only if needed.
- The valuable feature is gesture-to-record-to-submit, not the exact waveform implementation.
- Before Cut 4 implementation, audit Timbervox's FluidVoice integration and reuse its engine boundary
  and native audio/session behavior where appropriate. Do not adopt WhisperCode's
  `openai_whisper-tiny.en` one-shot path as the primary VibePad voice experience.

## 10. SSH and host setup

Host setup must be easy enough to reuse every day.

### 10.1 Required host profile fields

- profile name
- transport: direct or SSH tunnel
- OpenCode server URL for direct
- SSH host
- SSH port
- SSH username
- assigned remote OpenCode port
- optional OpenCode Basic Auth username/password

### 10.2 Saved state

Persist:

- host profile metadata in UserDefaults/JSON
- current host profile
- generated device SSH key in Keychain/Secure Enclave path as currently implemented
- Basic Auth password in Keychain
- trusted host key fingerprint
- last selected project per host if possible
- last preview URL per project if possible

### 10.3 Setup flow

On launch, VibePad reconnects the last-used host profile automatically. The active host is shown in
the compact host/project context control at the top-left of the workspace; it is not a permanent
top-level sidebar section. Selecting that control switches host/project, adds a host, or opens full
profile management.

For Simon's TestFlight builds, a `GMK Server` direct profile may be seeded from build configuration
when no saved profiles exist. The source tree must not hard-code private credentials. The default
main-API route should be the stable Tailscale/MagicDNS address when the iPad is enrolled, with the LAN
address available as a local profile. Cloudflare preview tunnels remain independent from the main
OpenCode connection because the main API relies on long-lived SSE behavior.

For a direct profile, first-run setup requires only a reachable OpenCode URL and optional Basic Auth.
After a successful health check, it is saved and becomes the current auto-connect profile.

The onboarding presentation adapts WhisperCode's open-source step progression, with its MIT notice
kept when source is copied, but uses a deterministic connection contract:

1. Welcome and explain that VibePad connects to OpenCode on another machine.
2. Choose between VibePad Cloud (shown as coming soon) and a self-hosted computer.
3. For self-hosting, choose targeted SSH setup or an existing reachable OpenCode URL.
4. For direct setup, probe `/global/health`, show the detected version, and save only after health
   succeeds.
5. For SSH setup, enter one exact Tailscale/LAN/DNS host, SSH port, username, one-time password,
   and remote OpenCode port. The bootstrap working directory defaults internally to the remote home
   directory; a custom root belongs in advanced settings, not first-run onboarding.
6. Inspect that host over SSH and stop at an explicit state: unreachable, installation required,
   installed but stopped, already healthy, or connected. Do not loop indefinitely when the computer
   is offline or SSH is unavailable.
7. If OpenCode is missing, request explicit installation consent and disclose the official installer
   command. If it is installed but stopped, show `Start and connect`; if it is healthy, show `Connect`.
8. Install the VibePad device public key, start or reuse OpenCode bound to `127.0.0.1` on the assigned
   remote port, create the local SSH tunnel, and prove API health before saving completion.

The onboarding canvas is centered rather than wrapped in an outer settings card. It defaults to dark
appearance on a fresh install, supports light appearance, and uses only neutral gray plus VibePad blue
for segmented progress. The progress, spinner, tabs, inputs, item surfaces, buttons, and confirmation
dialog are copied SwiftCN components or VibePad composites built from those components.

The normal SSH onboarding path does not scan the subnet because VibePad already has the exact target
and is responsible for starting the server. Discovery can remain an optional convenience later. The
SSH password is bootstrap-only and is never persisted; subsequent connections use the generated
device key.

Basic Auth secures the OpenCode HTTP API; it is not SSH authentication. Direct LAN, Tailscale, VPN,
or HTTPS profiles do not require SSH when OpenCode is already running and reachable.

For manual SSH tunnel profiles, VibePad still exposes the generated device public key and complete
host configuration. First-run onboarding automates that key installation when password SSH is
available; manual key installation remains the fallback when password login is disabled.

### 10.4 Optional SSH bootstrap and server start

The OpenCode PTY API cannot start the OpenCode server that provides that API. When a saved host is
offline, starting it from the iPad therefore requires an independent control path.

An SSH-managed host profile may optionally store a reviewed start recipe. First-run onboarding uses
a dedicated VibePad-owned OpenCode process on the assigned remote port (default `19001`) and writes
its log under `~/.local/state/vibepad/`. It never starts, stops, or replaces the user's normal port
`4096` process. A later hardened profile may prefer an OS-managed service (`systemd --user` on Linux
or `launchd` on macOS), with an explicit command as a fallback. The connection card can then show
`OpenCode offline` and a `Start OpenCode` action that:

1. Connects with the existing device SSH key.
2. Checks whether the configured OpenCode port is already healthy.
3. Runs the saved start recipe only when it is not healthy.
4. Waits for `/global/health` and then completes the normal API connection.

VibePad must never kill or restart an active OpenCode process automatically. Simon's GMK profile can
be prefilled from build configuration with the Tailscale/LAN API address and SSH bootstrap metadata,
but no private key, password, or private credential is committed to source.

## 11. Project and preview model

Projects do not need to live inside this app repo.

OpenCode sessions are attached to directories on the host. VibePad should show projects from OpenCode where available and support custom paths.

The UI treats a session as belonging to the project/worktree matching its OpenCode directory and
project scope. This is a client-side organization of server resources, not a new VibePad server-side
parent object. A session tab always carries the host and project scope it was opened from.

Per project, store:

- preferred preview type
- preview command and working directory
- readiness/health rule
- local port or URL rule
- reachability strategy
- preferred viewport mode
- last active session

v1 can store this locally in app state. Later this can become a project-side config file or host helper config.

## 12. Open questions

- The exact transport/API contract between VibePad and the host-side preview manager.
- Whether the first reachability implementation is a named Cloudflare tunnel, a quick tunnel,
  Tailscale, or a project-selectable combination.
- Whether iPhone support should be retained visually or treated as best-effort after iPad.
- Whether Pencil annotation should attach only images in v1 or also structured stroke metadata.

## 13. MVP acceptance criteria

MVP is successful when:

- app connects to an OpenCode server via direct URL
- app connects via saved SSH profile
- app lists sessions
- app shows chat and streaming updates
- app shows file tree and file preview
- pressing Preview starts or reuses a configured dev process and opens its reachable WKWebView URL
- app supports fullscreen and split preview modes on iPad
- app records voice and inserts transcript into composer
- app supports PencilKit drawing over preview
- app sends annotated screenshot into the current OpenCode session

## 14. TestFlight super cuts

### Cut 1: SwiftCN workspace and OpenCode loop

- Sync and audit the current SwiftCN registry and vendored components.
- Replace the rigid/system-navigation shell with the project rail, primary session tabs, main
  workbench, and one configurable utility drawer defined above.
- Add a per-domain `WorkspaceStore`; do not grow transitional `AppState` for layout state.
- Adapt the open-source onboarding progression for direct URL and targeted SSH setup, including
  health/version checks, Basic Auth, consented OpenCode installation, device-key provisioning, and
  a dedicated SSH-managed server start.
- Preserve and polish existing chat, tool, permission, session, file, host, and speech behavior.
- Consume OpenCode file events so open file state refreshes in real time.
- Ship a TestFlight where the GMK host can auto-connect and the complete OpenCode loop is usable.

### Cut 2: Automatic live preview

- Implement the host preview-manager contract and saved project preview profiles.
- Add `LivePreviewView`, preview status, viewport presets, logs, restart/stop, split, and fullscreen.
- Add automatic Cloudflare/Tailscale reachability as configured by the profile.
- Ship a TestFlight where Preview starts a real project and hot reload is visible with no SSH or URL entry.

### Cut 3: Pencil feedback loop

- Add the PencilKit overlay, undo/clear, and contextual send affordance.
- Composite the WKWebView snapshot with Pencil drawing and preview/session metadata.
- Send through the existing attachment pipeline and preserve drawings across retryable failures.
- Ship a TestFlight where visual feedback reaches the active OpenCode session in one action.

### Cut 4: Gesture-first voice/orb

- Add the two-finger hold, right-send, left-cancel interaction with haptic thresholds.
- Build the orb/voice surface natively and retain the existing speech-engine seam and mic fallback.
- Bind voice automatically to the current preview annotation, file, or chat context.
- Ship a TestFlight where a request can be spoken and submitted from fullscreen preview with chat hidden.
