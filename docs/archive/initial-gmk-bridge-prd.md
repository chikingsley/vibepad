# Initial GMK Bridge PRD (Archived)

> Historical draft from `/home/simon/github/VIBEPAD`. Superseded by the native
> VibePad product and architecture documents in this repository.

Status: draft
Date: 2026-07-06
Primary host: gmk-server
Project path: `/home/simon/github/VIBEPAD`

## 1. Summary

VIBEPAD is a personal iPad-first control surface for building local/server projects with an AI coding agent. It should collapse the current workflow of SSH, tmux, browser preview, voice dictation, screenshots, and back-and-forth agent prompting into one focused surface.

The first version should not try to make the iPad a full IDE. It should make the iPad the best control and review surface for projects already running on `gmk-server`.

Core loop:

```text
iPad VIBEPAD client
  -> speech-to-text + preview markup
  -> VIBEPAD bridge on gmk-server
  -> opencode session/server
  -> project dev server / preview URL
  -> streamed chat, events, diffs, and hot reload back to iPad
```

## 2. Problem

The current working style is effective but fragmented:

- SSH into `gmk-server` using Termius, RustDesk, or plain SSH.
- Start or attach to tmux sessions.
- Run an agent and project dev server.
- Open a web/mobile preview separately.
- Use voice dictation to talk to the agent.
- Use screenshots or verbal descriptions to point at UI problems.
- Switch contexts repeatedly between terminal, browser, preview, and chat.

The missing piece is a unified, low-friction surface where the preview, agent chat, voice input, and visual markup share one session context.

## 3. Product goal

Build a private tool that lets the user work from an iPad while projects and agents run on `gmk-server`.

VIBEPAD should make these actions feel native:

- Open a known project on `gmk-server`.
- Start or resume an opencode session for that project.
- Start or attach to the project preview server.
- See the live preview and agent chat in one UI.
- Speak an instruction and optionally draw on the preview.
- Send the combined context to opencode.
- Stream the agent response, tool activity, diffs, and status.
- Let hot reload refresh the preview by default.
- Approve, cancel, or redirect agent work without going back to SSH.

## 4. Non-goals

VIBEPAD v1 will not be:

- A public App Store product.
- A general overlay on top of arbitrary iPad apps, Safari, Expo Go, or the iPad home screen.
- A full code editor for the iPad.
- A replacement for opencode, Codex, tmux, or the project dev server.
- A direct shell exposed to a voice model.
- A Mac/Xcode-native app development interface in the first milestone.
- A general-purpose remote desktop replacement.

## 5. Target workloads

VIBEPAD should optimize for the project types the user actually builds most often.

### 5.1 Expo apps

Primary v1 assumption:

- Use Expo web preview first because it can run as a normal web surface and be embedded/annotated more easily.
- Use hot reload as the default feedback loop.
- Treat Expo Go/dev-client real-device preview as a later enhancement, not the first overlay target.

Desired future support:

- Track both web preview and mobile-size preview tabs.
- Optionally show Expo QR/deep-link controls.
- Support project commands such as `expo start`, `expo start --web`, or repo-specific scripts through project profiles.

### 5.2 Cloudflare/Hono/OpenAPI apps

Primary v1 assumption:

- Support Cloudflare Worker/web apps exposed by local dev server or Cloudflare tunnel.
- Favor the user's existing Hono/OpenAPIHono style for new Cloudflare templates.
- Treat tunnel automation as a first-class integration after the basic preview and opencode loop works.

Known adjacent tooling from prior work:

- A Cloudflare route helper was originally prototyped as `cfroute`.
- The desired direction was a repo/folder named `Cloudflare`, flattened compose/env files, and a `cloudflare-cli` inside that setup.
- VIBEPAD should integrate with that final Cloudflare setup after the actual current path and command contract are confirmed.

### 5.3 Mac apps

Mac app development is out of scope for v1.

If this becomes relevant later, VIBEPAD should treat Mac app preview as a separate capture/remote-control problem, not mix it into the Expo/Cloudflare first version.

## 6. Primary user experience

### 6.1 Project picker

The opening screen shows known project roots on `gmk-server`, not an arbitrary filesystem browser.

Each project can define:

- Project name.
- Local path.
- Type: `expo`, `cloudflare`, `web`, or `custom`.
- Dev command.
- Expected local preview URL.
- Optional public tunnel hostname.
- opencode working directory.
- Environment notes.

### 6.2 Session screen

A project session has three main surfaces:

- Preview: live web view of the running app.
- Chat: opencode conversation and streamed agent events.
- Control rail: voice, send, cancel, approve, refresh, open tunnel, and layout controls.

Layouts:

- Preview focus: preview takes most of the screen; chat is hidden or a small drawer.
- Chat focus: chat takes most of the screen; preview is a small live thumbnail.
- Split: preview and chat side by side.
- Markup mode: preview is frozen or semi-live, drawing layer is active, send controls are prominent.

### 6.3 Voice flow

Basic interaction:

1. Hold a large talk target or use a two-finger hold gesture.
2. Speak the instruction.
3. Optionally draw or select on the preview.
4. Release to stop recording.
5. Review/edit the transcript if needed.
6. Swipe/send to opencode.
7. Stream response and preview changes.

The voice layer should produce text and metadata. It should not directly execute filesystem or shell tools.

### 6.4 Markup flow

Supported markup primitives for v1:

- Freehand stroke.
- Rectangle/region select.
- Circle/spotlight.
- X/cross-out means remove or inspect what is wrong.
- Arrow means move, point to, or connect.
- Text note attached to a region.

VIBEPAD should send raw strokes plus normalized annotations to the bridge. The agent prompt should include both the user's transcript and a plain-language summary of the visible markup.

### 6.5 Agent streaming flow

The chat surface should show:

- User transcript and attached markup thumbnail.
- opencode assistant messages.
- Tool activity.
- File changes/diff summaries where available.
- Current state: idle, thinking, editing, running command, waiting for approval, done, failed, canceled.

The preview should generally rely on hot reload. Manual refresh remains available.

## 7. Architecture

### 7.1 Components

```text
+-------------------------------+
| iPad VIBEPAD client           |
| - preview web surface         |
| - chat surface                |
| - canvas/Pencil overlay       |
| - microphone/STT controls     |
+---------------+---------------+
                |
                | HTTPS/WebSocket over LAN, Tailscale, or Cloudflare tunnel
                v
+-------------------------------+
| VIBEPAD bridge on gmk-server  |
| - project registry            |
| - opencode adapter            |
| - preview manager             |
| - STT adapter/proxy           |
| - event stream multiplexer    |
| - tunnel integration          |
+---------------+---------------+
                |
                +--> opencode server/session
                +--> project dev server
                +--> Cloudflare tunnel helper
                +--> Toy Local/local STT service, once endpoint confirmed
```

### 7.2 Client choice

Recommended first build:

- Server-hosted web client optimized for iPad Safari.
- Use standard web canvas/pointer events for the first markup layer.
- Embed preview in an iframe or managed webview surface where possible.
- Upgrade to a native SwiftUI/PencilKit shell only if Safari canvas/Pencil support is not good enough.

Rationale:

- The user wants code and services to live on `gmk-server`.
- A web client is faster to iterate with opencode, Expo web, and Cloudflare previews.
- Native iPad work can come after the product loop is proven.

Known limitation:

- A web client can draw over an embedded preview, but it cannot deeply inspect cross-origin DOM without cooperation from the preview app.
- For same-origin/local preview integration, VIBEPAD can later inject a small helper script or use a preview proxy.

### 7.3 Bridge service

The bridge owns orchestration. It should not become a second AI agent.

Responsibilities:

- Maintain project registry.
- Start/stop project dev commands when explicitly requested.
- Start/resume opencode sessions.
- Stream opencode events to the client.
- Track preview URLs and health.
- Package voice transcript, screenshot, and markup into an agent prompt.
- Manage STT provider configuration.
- Manage tunnel exposure only through approved project profiles.

### 7.4 opencode integration

Default backend: opencode server/headless mode.

VIBEPAD should prefer opencode server APIs/events over shelling into interactive terminal sessions.

Needed capabilities:

- Create or resume session in a project directory.
- Send prompt text plus attachments/context.
- Stream assistant messages and tool events.
- Surface file/diff information if available.
- Surface permission prompts and approval states.
- Cancel an active run.

Fallback:

- If opencode server APIs are insufficient for a specific operation, use a narrow bridge-side CLI adapter only for that operation.

### 7.5 Speech-to-text integration

The STT/API target is Toy Local Cloud, specifically `ToyLocalCloudflareApi`, not the older `gmkserver-api` container/service. VIBEPAD should integrate with the Toy Local Worker contract and keep the bridge pointed at that product surface.

Known Toy Local Cloud API surface from prior repo/chat-history inspection:

- Worker script: `toy-local-cloudflare-api`.
- API package: `ToyLocalCloudflareApi/` in the `toy-local` repo.
- Health/docs: `GET /health`, `GET /docs`, `GET /openapi.json`.
- Upload path: `POST /v1/uploads`, `PUT /v1/uploads/{upload_id}`.
- Batch/job fallback: `POST /v1/transcriptions`, `GET /v1/jobs/{job_id}`.
- Realtime path: `GET /v1/realtime` WebSocket through the `RealtimeSession` Durable Object.
- Text transform path: `POST /v1/text-transforms`.

VIBEPAD's preferred interaction model should use the Toy Local realtime path for live speech/control when live validation confirms the deployed route and auth. The upload/transcription/jobs path remains the fallback for file-based or non-realtime turns.

Expected abstraction:

```text
Client audio
  -> VIBEPAD bridge STT adapter
  -> ToyLocalCloudflareApi realtime or transcription route
  -> transcript events/result
  -> VIBEPAD client and intent packet
```

VIBEPAD should keep STT replaceable while preserving Toy Local as the default integration:

- ToyLocalCloudflareApi `/v1/realtime`: preferred live path after validation.
- ToyLocalCloudflareApi `/v1/transcriptions`: fallback/batch path.
- Voxtral-compatible direct service: optional future provider path, behind the same adapter.
- Browser/iPad dictation: manual fallback, not a product-quality integration.

### 7.6 Preview management

Preview targets should be explicit objects, not guessed tabs.

Preview target fields:

- `id`
- `label`
- `kind`: `expo-web`, `cloudflare-worker`, `plain-web`, `custom`
- `localUrl`
- `publicUrl`
- `devCommand`
- `healthUrl`
- `viewportPresets`
- `hotReloadExpected`

VIBEPAD should support multiple view presets:

- iPhone narrow.
- iPad/tablet.
- Desktop.
- Custom dimensions.

### 7.7 Cloudflare tunnel integration

Tunnel automation is useful but should not block the MVP.

Desired behavior:

- Project profile can request a temporary or named public preview URL.
- VIBEPAD calls the user's existing Cloudflare CLI/helper instead of reimplementing DNS/tunnel logic.
- VIBEPAD records what tunnel/hostname maps to what local service.
- VIBEPAD can tear down temporary routes when a session closes, if explicitly configured.

Rules:

- Do not create DNS/tunnel routes implicitly without showing the target local port and hostname.
- Do not store Cloudflare tokens in VIBEPAD source.
- Reuse the existing Cloudflare setup after confirming whether it lives at `/home/simon/github/Cloudflare`, `/home/simon/github/cfroute`, or another final path.

## 8. Data contracts

### 8.1 Intent packet

```json
{
  "projectId": "toy-mobile",
  "sessionId": "opencode-session-id",
  "previewTargetId": "expo-web",
  "transcript": "Make the cards line up and remove this pricing link.",
  "markup": {
    "screenshotId": "shot_20260706_001",
    "viewport": { "width": 1024, "height": 768, "preset": "ipad" },
    "strokes": [],
    "annotations": [
      { "type": "cross_out", "bounds": { "x": 712, "y": 80, "width": 96, "height": 44 }, "label": "remove" },
      { "type": "arrow", "from": { "x": 420, "y": 360 }, "to": { "x": 620, "y": 360 }, "label": "move right" }
    ]
  },
  "context": {
    "currentUrl": "http://localhost:8081/",
    "route": "/",
    "visibleText": [],
    "recentAgentSummary": "Previous change adjusted hero spacing."
  }
}
```

### 8.2 Project profile

```json
{
  "id": "example-expo-app",
  "name": "Example Expo App",
  "path": "/home/simon/github/example-expo-app",
  "kind": "expo",
  "agent": {
    "provider": "opencode",
    "workingDirectory": "/home/simon/github/example-expo-app"
  },
  "preview": {
    "devCommand": "pnpm expo start --web",
    "localUrl": "http://127.0.0.1:8081",
    "hotReloadExpected": true,
    "viewportPresets": ["iphone", "ipad", "desktop"]
  }
}
```

### 8.3 Agent event

```json
{
  "type": "agent.status",
  "sessionId": "opencode-session-id",
  "status": "editing",
  "message": "Updating hero layout and removing pricing nav link."
}
```

## 9. Functional requirements

### 9.1 Project/session management

- List configured projects.
- Open a project session.
- Start or attach to opencode for that project.
- Resume recent sessions.
- Show whether dev server and preview are running.
- Let the user start/stop preview commands explicitly.

### 9.2 Preview

- Display live preview in the iPad client.
- Support mobile/tablet/desktop viewport presets.
- Support manual refresh.
- Preserve preview state when switching to chat and back where possible.
- Capture screenshot/frame for markup context.

### 9.3 Chat and agent stream

- Show current opencode conversation.
- Stream new messages and tool/status events.
- Distinguish thinking, editing, command-running, waiting, failed, done, and canceled states.
- Allow canceling an active agent turn.
- Show diff summaries when available.

### 9.4 Voice/STT

- Record a voice instruction from the iPad client.
- Send audio to the configured STT adapter.
- Stream or return transcript text.
- Let the user edit transcript before sending.
- Attach transcript to preview markup and session context.

### 9.5 Markup

- Draw on top of the preview.
- Clear/undo markup.
- Convert common marks into annotation hints where possible.
- Send screenshot plus markup to the bridge.
- Preserve raw strokes for future model-side interpretation.

### 9.6 Safety and permissions

- No direct voice-to-shell execution.
- All filesystem/shell changes happen through opencode and its permission model.
- Destructive operations require explicit user approval.
- Tunnel creation requires explicit project/hostname/port visibility.
- Secrets stay outside source control.

## 10. Project templates

VIBEPAD should eventually include or reference two maintained project templates because most target work falls into two buckets.

### 10.1 Expo template

Expected shape:

- Expo app with web target enabled.
- Known dev script for web preview.
- Hot reload enabled.
- Optional mobile viewport presets.
- Optional deep-link/QR metadata for later Expo Go/dev-client support.

### 10.2 Cloudflare template

Expected shape:

- Hono or OpenAPIHono app.
- OpenAPI route exposed at `/openapi.json` when relevant.
- Wrangler dev/deploy scripts.
- Local env file guidance.
- Optional D1/R2 bindings.
- Optional tunnel profile.

Template work is not part of the first VIBEPAD MVP, but the PRD should keep the architecture aligned with these two project families.

## 11. Milestones

### Milestone 0: Discovery and repo setup

Deliverables:

- `VIBEPAD` folder and docs.
- Confirm opencode availability and server API behavior on `gmk-server`.
- Confirm the active ToyLocalCloudflareApi base URL, auth flow, and realtime route behavior.
- Confirm the current Cloudflare helper path and command contract.
- Decide whether the first client is pure web or native shell.

Exit criteria:

- A concrete implementation plan can be written without guessing endpoints or paths.

### Milestone 1: Thin bridge and manual prompt loop

Deliverables:

- Minimal bridge service on `gmk-server`.
- Static project registry.
- Connect to opencode server or CLI adapter.
- Send typed prompts from browser UI.
- Stream opencode responses/events.

Exit criteria:

- From iPad browser, open VIBEPAD and run a real opencode turn against one project.

### Milestone 2: Preview surface

Deliverables:

- Embed a live web preview.
- Support mobile/tablet/desktop viewport presets.
- Attach preview URL to opencode prompt context.
- Manual refresh.

Exit criteria:

- User can view an Expo web or Cloudflare preview and chat with opencode in one screen.

### Milestone 3: Speech-to-text

Deliverables:

- Record audio in client.
- Send to STT adapter.
- Return/edit transcript.
- Send transcript as opencode prompt.

Exit criteria:

- User can speak an instruction from iPad and send it to opencode without using the keyboard.

### Milestone 4: Markup context

Deliverables:

- Draw over preview.
- Capture screenshot and strokes.
- Send intent packet to bridge.
- Prompt opencode with transcript plus markup summary.

Exit criteria:

- User can point at UI with drawing and have opencode receive useful visual context.

### Milestone 5: Cloudflare and template integration

Deliverables:

- Project profiles for Expo and Cloudflare apps.
- Optional Cloudflare tunnel helper integration.
- First project-template docs or scaffolds.

Exit criteria:

- VIBEPAD can open common project types with minimal per-project setup.

## 12. Risks

### 12.1 opencode API drift or insufficient event surface

Mitigation:

- Keep a bridge adapter boundary.
- Use server APIs where possible.
- Fall back to narrow CLI operations only when needed.

### 12.2 STT endpoint uncertainty

Mitigation:

- Treat STT as a replaceable adapter.
- Lock the actual Toy Local/local service contract before implementation.

### 12.3 Preview embedding and cross-origin limits

Mitigation:

- Start with a preview overlay that does not require DOM access.
- Add same-origin preview proxy or helper injection later if needed.

### 12.4 iPad browser limitations

Mitigation:

- Start web-first for speed.
- Move to native SwiftUI/PencilKit shell only if browser input, audio, or drawing quality blocks the workflow.

### 12.5 Agent safety

Mitigation:

- Voice creates instructions, not commands.
- opencode remains the execution boundary.
- Approvals remain visible in the chat/control surface.

## 13. Open questions

- What exact ToyLocalCloudflareApi base URL and credential should VIBEPAD use for realtime and fallback transcription?
- Is opencode installed and configured on `gmk-server`, and which command/path should VIBEPAD use?
- What is the final current path for the Cloudflare helper: `/home/simon/github/Cloudflare`, legacy `/home/simon/github/cfroute`, or another folder?
- Should the first client be a server-hosted iPad web app or a native SwiftUI shell?
- What domain naming scheme should VIBEPAD use for public/tunnel previews?
- Should VIBEPAD own project templates, or should templates live as separate repos consumed by VIBEPAD?

## 14. Recommended first implementation slice

Build the smallest useful loop first:

1. Server-hosted VIBEPAD web UI.
2. Static project profile for one Expo web or Cloudflare app.
3. opencode session start/send/stream.
4. Embedded preview URL.
5. Manual typed prompt.
6. Then add STT.
7. Then add markup.

Reasoning:

- The preview/chat loop is the core value.
- STT and markup are multipliers, but they depend on the session/preview bridge being real.
- Expo web and Cloudflare previews are enough to validate the product without fighting native iPad app constraints first.
