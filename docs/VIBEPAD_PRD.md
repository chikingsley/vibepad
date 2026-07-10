# VibePad Native iPad Client PRD

> Working draft. This document defines the VibePad fork direction on top of `grapeot/opencode_ios_client`.

## 1. Product position

VibePad is an iPad-first native client for controlling OpenCode sessions on a remote Mac/Linux host.

The app is not a local coding environment and does not run OpenCode on the iPad. It is a native control surface for an already-running `opencode serve` or `opencode web` backend, with iPad-specific interaction added on top: split-view project control, live preview, Apple Pencil annotation, voice steering, and SSH/tunnel setup.

The base repo already provides the core OpenCode client layer:

- REST API client for OpenCode sessions, files, messages, diffs, permissions, questions, agents, models, and projects.
- SSE client for live server events.
- Native chat UI with streaming, tool cards, reasoning, permissions, questions, image attachments, and voice composer.
- File tree and file preview.
- Host profiles and SSH tunnel support.
- Markdown preview with native and WKWebView renderers.

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

### 4.1 VoiceFlowKit

The current app uses `VoiceFlowKit`, pinned from `https://github.com/grapeot/voiceflow.git`.

In this codebase it is a speech-client package, not the commercial Voiceflow conversation-builder product. The wrapper lives in `AppState+VoiceFlowKit.swift` and provides:

- one-shot audio transcription
- realtime WebSocket speech sessions
- preserved-audio retry/discard behavior
- Settings-side connection testing

The current settings call this endpoint "AI Builder" and store:

- base URL
- token
- custom prompt
- terminology list

VibePad decision:

- Keep the existing UI and microphone lifecycle initially.
- Replace or adapt the backend config so it points at the preferred ToyLocal/ToyLocalCloudflareApi speech service.
- Preserve the existing waveform/voice rail interaction unless a better dedicated VibePad voice surface is built.

Open question:

- Verify whether ToyLocalCloudflareApi can expose the same realtime/session contract expected by `VoiceFlowKit`, or whether VibePad should replace the `VoiceFlowClient` wrapper with a ToyLocal-specific client.

### 4.2 Citadel SSH tunnel

The current app uses Citadel `0.12.0`, a Swift SSH client library built on SwiftNIO SSH.

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

VibePad should default to an iPad-first workspace with resizable regions:

```text
----------------------------------------------------------------------------+
| Project / Host / Session controls                 Voice / Preview controls |
+----------------------+-----------------------------+-----------------------+
| Workspace            | Preview                     | Chat                  |
|                      |                             |                       |
| Files                | Live app/web preview         | Messages              |
| Sessions             | Pencil annotation overlay    | Tool cards            |
| Diffs                | Preview toolbar              | Voice composer        |
|                      |                             | Permissions/questions |
+----------------------+-----------------------------+-----------------------+
```

Required panel modes:

- `Chat + Files`: no preview, larger chat.
- `Chat + Preview`: file tree collapsed.
- `Files + Preview + Chat`: default iPad mode.
- `Fullscreen Preview`: preview and Pencil overlay take almost all space.
- `Fullscreen Chat`: preview hidden, chat dominates.

Preview panel should be open/closeable with one obvious button.

### 5.1 Always-visible project context

In VibePad, "project context" means the execution scope for OpenCode requests:

- connected host/profile
- selected remote directory or worktree
- current session
- optional OpenCode workspace identifier when that API surface is exposed in the UI

It does not mean the language model's token/context window. VibePad should show a compact context strip in every primary layout so the user can tell which machine and directory an action will affect before sending a prompt or approving a tool.

Changing the host or directory is a real state transition. The app must clear stale selection where necessary and reload sessions, files, diffs, agents/models, commands, MCP state, and preview state using the new scope. A session opened from a different directory must either switch the visible context explicitly or show a clear mismatch, never silently mix data from two directories.

## 6. Files and chat

The fork should preserve existing file and chat functionality:

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

The current app has `MarkdownWebPreviewView`, but that is for rendering Markdown in a local WKWebView shell. VibePad needs a separate live preview surface.

### 7.1 Preview types

VibePad should support at least these preview types:

- `Web`: normal web app URL.
- `Expo Web`: Expo web preview URL.
- `Expo Mobile Shape`: same web preview framed as iPhone-sized viewport.
- `Cloudflare Worker`: local or tunnel URL.
- `Manual URL`: user enters any URL reachable from the iPad/app.

### 7.2 Preview display modes

For Expo/mobile-oriented work:

- show an iPhone-frame preview mode by default
- allow rotation portrait/landscape
- allow zoom fit/fill

For normal web/Cloudflare work:

- show full-width responsive preview
- allow desktop/tablet/mobile viewport presets

### 7.3 Preview lifecycle

v1 should support manual preview URL entry.

v1.1 should add project-aware preview commands:

- start dev server
- stop dev server
- restart dev server
- reopen last preview URL
- detect common ports from command output
- optionally expose through Cloudflare helper

Implementation options:

- Use OpenCode shell/PTY endpoints to run project commands.
- Add a VibePad helper service on the host for safer preview orchestration.
- Add an OpenCode plugin later for `open_preview` / `start_preview` tool calls.

Initial recommendation:

- Start with manual URL plus saved per-project preview URL.
- Add host helper after the app shell works.

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

- UIKit `UILongPressGestureRecognizer` supports one or more fingers and configurable minimum press duration.
- UIKit recognizers expose `numberOfTouchesRequired`, location, state transitions, and cancellation/failure.
- SwiftUI supports gesture composition with simultaneous/sequence/exclusive gestures.
- For a two-finger hold with directional release, UIKit is likely cleaner than pure SwiftUI because it gives reliable touch counts and state transitions.

VibePad implication:

- Implement the two-finger voice gesture as a transparent UIKit gesture layer over the main iPad workspace.
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

For SSH tunnel profile:

1. Generate/show device public key.
2. User adds public key to server/gateway.
3. User enters host/port/username/remote port.
4. App tests SSH connection.
5. App tests OpenCode health through local tunnel.
6. App saves profile.

VibePad should display the generated command/config snippet needed on the server where possible.

## 11. Project and preview model

Projects do not need to live inside this app repo.

OpenCode sessions are attached to directories on the host. VibePad should show projects from OpenCode where available and support custom paths.

Per project, store:

- preferred preview type
- preferred preview URL
- preferred dev command
- preferred viewport mode
- last active session

v1 can store this locally in app state. Later this can become a project-side config file or host helper config.

## 12. Open questions

- Whether ToyLocalCloudflareApi already exposes the exact realtime speech interface expected by `VoiceFlowKit`.
- Whether preview orchestration should be through OpenCode shell/PTY or a separate VibePad host helper.
- Whether Cloudflare tunnel setup belongs in the iPad app, host helper, or manual docs first.
- Whether iPhone support should be retained visually or treated as best-effort after iPad.
- Whether Pencil annotation should attach only images in v1 or also structured stroke metadata.

## 13. MVP acceptance criteria

MVP is successful when:

- app connects to an OpenCode server via direct URL
- app connects via saved SSH profile
- app lists sessions
- app shows chat and streaming updates
- app shows file tree and file preview
- app opens/closes a live WKWebView preview from a saved URL
- app supports fullscreen and split preview modes on iPad
- app records voice and inserts transcript into composer
- app supports PencilKit drawing over preview
- app sends annotated screenshot into the current OpenCode session

## 14. Phase plan

### Phase 1: Rebrand and baseline

- Rename visible product to VibePad.
- Keep upstream architecture.
- Add VibePad PRD and setup notes.
- Confirm host profiles and SSH setup match GMK workflow.

### Phase 2: Live preview

- Add `LivePreviewView`.
- Add preview panel state.
- Add manual URL preview.
- Add viewport presets.
- Add open/close/fullscreen controls.

### Phase 3: Pencil annotation

- Add PencilKit overlay.
- Add clear/undo/send controls.
- Attach annotated screenshot to chat.

### Phase 4: Voice gesture

- Add two-finger hold gesture.
- Keep mic button fallback.
- Tune waveform/voice rail states.

### Phase 5: Project preview orchestration

- Add saved preview URL per project.
- Add dev command presets.
- Add host helper or OpenCode-shell command integration.
- Add Cloudflare helper integration only after basic preview works.
