# VibePad TODO

This is the implementation TODO for turning `opencode_ios_client` into VibePad. It does not list existing behavior as work. Existing behavior is only named when it affects what we build next.

## 0. Stabilization and release ownership

- [x] Integrate upstream through `9b1733f` while preserving the VibePad worktree.
- [x] Adopt Apple's `swift-format` and strict SwiftLint checks with no generated baseline.
- [x] Move all targets to Swift 6 language mode with complete strict concurrency checking.
- [x] Make the app and test bundles compile without warnings on Xcode 26.6 / Swift 6.3.3.
- [x] Restore a green unit-test suite and fix every code-facing failure found by the non-live UI fixtures.
- [x] Make the non-live UI lane deterministic in one command by serializing the UI target and fixing layout-dependent accessibility queries.
- [x] Create the private `chikingsley/vibepad` repository, make it `origin`, and preserve the inherited repository as `upstream`.
- [x] Add a repository-managed pre-commit hook for Apple `swift-format` and strict SwiftLint. Keep slow builds/tests as explicit validation lanes.
- [x] Set the VibePad display name, `com.vibepad.app` bundle identifier, iPad-only target, automatic signing, and development team; verify a signed generic iOS-device build.
- [ ] Verify distribution signing and App Store Connect ownership, add any required privacy manifest/API reasons, and complete TestFlight/App Store metadata.

## Evidence baseline

Already present in the fork:

- OpenCode REST/SSE client foundation: sessions, messages, async prompts, permissions, questions, agents/models, diffs, todos, file tree/content/search/status.
- Chat streaming and tool-call rendering.
- Session list/create/fork/archive/restore/delete.
- File tree, file content, search, markdown/code/image display.
- Direct server profiles and SSH-tunnel profiles.
- Keychain storage for OpenCode Basic Auth password.
- Citadel SSH keypair generation and host-key trust.
- Voice input through `VoiceFlowKit` with realtime sessions, audio level, commit/stop, preserved-audio retry/discard, and waveform UI.

Not present yet:

- Live app/site preview pane.
- PencilKit annotation overlay.
- Annotated screenshot plus transcript submission.
- Two-finger hold/swipe voice gesture.
- Preview lifecycle tools/MCP for Expo/Cloudflare/local dev servers.
- UI for OpenCode commands, available tools, MCP status, or tool schemas.

OpenCode facts to design around:

- `opencode [project]` starts TUI rooted at a path.
- `opencode serve` and `opencode web` expose a headless server; they do not expose a documented persistent server-wide "set root" endpoint.
- Directory/project scoping is per request/client via `x-opencode-directory`, SDK `directory`, CLI `--dir`, or specific query parameters where supported.
- Server APIs include project/path/VCS, sessions, messages, commands, files/search, experimental tools, MCP status/add, TUI control, and SSE events.
- OpenCode custom tools, MCP servers, commands, skills, rules, agents, and plugins are all distinct surfaces; preview lifecycle should be a tool/MCP boundary, not a prompt-only convention.

## 1. OpenCode directory/project handling

- [x] Add directory-scoped API support in the iOS client: project-scoped OpenCode requests can carry the selected remote directory/workspace scope.
- [x] Replace the inherited server-root restriction with an active remote directory/project scope for requests.
- [ ] Show active remote directory in the iPad UI at all times.
- [x] Build project picker from OpenCode `GET /project` and `GET /project/current`.
- [x] Add custom path entry for remote folders not discovered by `GET /project`.
- [ ] When selecting a project/directory, reload sessions, file tree, VCS state, command list, MCP status, and preview state for that directory.
- [ ] Make session filtering use the selected directory consistently.
- [ ] Add a "new project from parent folder" flow only after preview/tooling exists: it should call an OpenCode tool/command, not hardcode scaffolding inside the iOS app.

## 2. Live preview pane

- [ ] Add a new live-preview `WKWebView` surface separate from the existing Markdown web preview.
- [ ] Add URL bar/state: current URL, title, loading state, error state, TLS/load failures.
- [ ] Add preview controls: reload, stop, back, forward, copy URL, open externally.
- [ ] Add layout modes: hidden, side split, bottom/overlay split, full screen.
- [ ] Add resizable split behavior on iPad.
- [ ] Add per-session/per-project preview URL memory.
- [ ] Add "open URL returned by agent/tool" behavior from chat/tool output.
- [ ] Add lightweight JS bridge only for preview metadata we actually use: URL/title/viewport/selected text/element screenshot helpers.
- [ ] Do not tie the preview pane to Cloudflare or Expo; it should display any reachable URL.

## 3. PencilKit annotation overlay

- [ ] Add `PKCanvasView` overlay above the live `WKWebView` preview.
- [ ] Add annotation mode toggle without blocking normal page scrolling/tapping when annotation mode is off.
- [ ] Support draw, erase, clear, undo, redo.
- [ ] Support Apple Pencil input first; decide whether finger drawing is enabled separately from touch gestures.
- [ ] Capture flattened annotated preview image: web snapshot plus PencilKit drawing composited together.
- [ ] Persist raw `PKDrawing` data for the current annotation draft until sent or cleared.
- [ ] Include metadata with submissions: preview URL, viewport size, scroll position if available, timestamp, selected project directory, selected session.
- [ ] Send annotation payload to OpenCode as one user turn with text/transcript plus image attachment or equivalent OpenCode-supported part format.
- [ ] Add resend/error state if image/message submission fails.
- [ ] Do not implement local X/circle/arrow recognition for MVP.

## 4. Annotation and voice agent behavior

- [ ] Create a `vibepad-annotation-voice` OpenCode skill describing how to interpret voice plus marked-up screenshots.
- [ ] Add short `AGENTS.md` invariant: VibePad annotation/voice events should load the skill and treat annotation payloads as the primary referent.
- [ ] Define annotation conventions in the skill: circle/highlight identifies target, X usually means remove/change, arrow shows movement/relationship, handwriting is instruction when legible.
- [ ] Define voice transcript conventions: transcript may be rough; ask if destructive intent is ambiguous; do not over-normalize user wording before acting.
- [ ] Define attachment summary format shown in chat after sending an annotation.
- [ ] Define safety rule for destructive UI/code changes inferred from annotation.

## 5. Two-finger voice gesture

- [ ] Add a UIKit-backed two-finger hold recognizer that can sit above chat, files, and preview.
- [ ] Resolve gesture priority with `WKWebView`, scroll views, and `PKCanvasView` so normal one-finger/Pencil interactions still work.
- [ ] Start recording on two-finger hold.
- [ ] Show waveform/speech animation during hold using the existing voice audio-level stream where possible.
- [ ] Send on release or swipe-right release, depending on tested feel.
- [ ] Add cancel gesture/state.
- [ ] Support voice-only submission.
- [ ] Support voice plus current preview screenshot.
- [ ] Support voice plus active annotation.
- [ ] Support voice plus current file context.

## 6. Preview lifecycle MCP/tooling

- [ ] Implement a `vibepad-preview` MCP server or local OpenCode custom tool package; choose MCP if the same preview manager should be shared outside OpenCode.
- [ ] Expose `vibepad_preview_start` with args for project directory, kind (`expo-web`, `expo-native`, `cloudflare-worker`, `generic`), command, port, host, tunnel policy.
- [ ] Expose `vibepad_preview_status` returning process state, local URL, public URL if any, logs tail, health check result.
- [ ] Expose `vibepad_preview_stop` for one preview or all previews owned by VibePad.
- [ ] Expose `vibepad_preview_logs` if logs are needed in the iPad UI.
- [ ] Return machine-readable JSON so the iOS app can auto-open the URL and display state.
- [ ] Track ownership so VibePad never stops unrelated tunnels/dev servers.
- [ ] Add cleanup policy: stop ephemeral previews unless pinned.
- [ ] Add pinned preview policy for long-running personal dev services.

## 7. Expo workflows

- [ ] Implement Expo Web preview start through preview tooling: run `npx expo start --web` or project-specific equivalent and return the web URL.
- [ ] Display Expo Web inside the live `WKWebView` pane.
- [ ] Query Expo `/_expo/open` with `GET` for platform discovery and deep links.
- [ ] For native iOS preview, use `/_expo/open?platform=ios` data to open Expo Go/dev-client externally on the iPad when possible.
- [ ] Do not attempt to embed Expo Go/dev-client inside VibePad; treat native preview as external app launch/deep link.
- [ ] Show the native deep link and app id/runtime when available.
- [ ] Add fallback: if native deep link cannot open, keep Expo Web preview active.

## 8. Cloudflare workflows

- [ ] Configure OpenCode to use Cloudflare managed MCP for account/API actions where it fits.
- [ ] Evaluate whether the existing personal Cloudflare helper CLI should be wrapped by `vibepad-preview` instead of directly exposing Cloudflare API calls.
- [ ] Add preview tooling for exposing a local dev server from the remote machine through the existing Cloudflare setup.
- [ ] Ensure Cloudflare credentials stay on the remote/OpenCode side, not in the iPad app.
- [ ] Add explicit tunnel ownership naming/tagging for VibePad-created previews.
- [ ] Add public URL return path from tool output to iOS preview pane.
- [ ] Add stop/cleanup for VibePad-owned Cloudflare previews only.
- [ ] Add "pin this preview" behavior so important tunnels are not cleaned up automatically.

## 9. OpenCode commands/tools/MCP visibility in iPad UI

- [x] Add API client methods for `GET /command`.
- [x] Add API client methods for `GET /mcp`.
- [x] Add API client methods for `GET /experimental/tool/ids` and `GET /experimental/tool`.
- [ ] Add a compact "Agent tools" panel showing commands, MCP server status, and preview tool status.
- [ ] Add manual buttons for key VibePad commands: start preview, stop preview, status, send current preview, send annotation.
- [ ] Add status badges in chat when preview tools run.

## 10. Chat/file/preview integration actions

- [ ] Add "ask about current preview" action.
- [ ] Add "ask about current file" action.
- [ ] Add "send selected file path/content reference" action.
- [ ] Add "open file mentioned in chat/tool card" if not already complete for all relevant part types.
- [ ] Add "open preview URL mentioned in chat/tool output" action.
- [ ] Add "attach current screenshot" action.
- [ ] Add "attach current annotation" action.

## 11. iPad layout pass

- [ ] Make three primary surfaces explicit: chat, files/code, preview.
- [ ] Add layout presets: chat-first, preview-first, files-first, equal split.
- [ ] Make chat collapsible.
- [ ] Make file tree collapsible.
- [ ] Make preview resizable and full-screenable.
- [ ] Keep voice gesture and annotation controls reachable in every layout.
- [ ] Handle portrait and landscape separately.

## 12. Credential and safety work

- [ ] Keep OpenCode server auth support.
- [ ] Keep SSH key-based auth support.
- [ ] Decide whether password SSH is required; do not add it unless there is a real workflow need.
- [ ] Store any new host/profile secrets in Keychain.
- [ ] Keep Cloudflare tokens/API keys on the remote machine or MCP auth layer.
- [ ] Show connected host, selected project directory, and auth mode clearly before sending prompts/tools.
- [ ] Require confirmation for stopping pinned previews or destructive remote actions.

## MVP build order

1. Always-visible active host/project/directory context (directory-scoped requests are complete).
2. Live `WKWebView` preview pane with manual URL entry.
3. PencilKit overlay and flattened annotated screenshot capture.
4. Send text/voice plus annotated screenshot into OpenCode.
5. Two-finger hold voice gesture using existing voice pipeline.
6. `vibepad-preview` preview manager as MCP/custom tool with generic local server start/status/stop.
7. Expo Web preview through preview manager.
8. Cloudflare public preview through preview manager.
9. Commands/MCP/tools status panel.
